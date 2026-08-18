import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hasPermission } from '../../../lib/permissions';
import { invalidateCachedPage } from '../../../lib/render-cache';
import { getDb } from '../../../lib/db';
import { collections, entries, taxonomies, terms } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { getCanonicalUrls } from '../../../lib/queries';

const PRODUCTION_ORIGIN = 'https://waritaku.com';

/** Convert an R2 key like "rendered/anime/slug.html" back to a URL pathname. */
function keyToPathname(key: string): string {
    const withoutPrefix = key.replace(/^rendered/, '');
    const withoutExt = withoutPrefix.replace(/\.html$/, '');
    return withoutExt === '/index' ? '/' : withoutExt;
}

/** Purge Cloudflare edge cache for a list of absolute URLs. */
async function purgeEdgeUrls(env: any, urls: string[]): Promise<void> {
    const zoneId = env?.CLOUDFLARE_ZONE_ID;
    const apiToken = env?.CLOUDFLARE_CACHE_TOKEN;
    if (!zoneId || !apiToken || urls.length === 0) return;

    // CF purge API accepts max 30 URLs per request
    // To prevent exceeding Worker subrequest limits (1000 per invocation), we cap edge purging to 15,000 URLs (500 requests).
    const safeUrls = urls.slice(0, 15000);
    const chunks: string[][] = [];
    for (let i = 0; i < safeUrls.length; i += 30) {
        chunks.push(safeUrls.slice(i, i + 30));
    }
    
    // Process in batches of 10 concurrent requests to avoid hitting simultaneous connection limits
    for (let i = 0; i < chunks.length; i += 10) {
        await Promise.all(chunks.slice(i, i + 10).map(chunk =>
            fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ files: chunk }),
            })
        ));
    }
}

/** List all R2 keys under the rendered/ prefix, paginating with cursor. */
async function listAllRenderedKeys(renderCache: any): Promise<{ key: string; cachedAt: string | null }[]> {
    const results: { key: string; cachedAt: string | null }[] = [];
    let cursor: string | undefined;

    do {
        const opts: any = { prefix: 'rendered/', limit: 1000 };
        if (cursor) opts.cursor = cursor;
        const listed = await renderCache.list(opts);
        for (const obj of listed.objects) {
            results.push({
                key: obj.key,
                cachedAt: obj.customMetadata?.cachedAt ?? null,
            });
        }
        cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return results;
}

export const POST: APIRoute = async (ctx) => {
    const { locals, request } = ctx;
    const user = locals.user;
    const permissions = locals.permissions;

    if (!user || !permissions) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    if (!hasPermission(permissions, 'system', 'read')) {
        return new Response(JSON.stringify({ error: 'Forbidden: system permission required' }), { status: 403 });
    }

    if (!env?.RENDER_CACHE) {
        return new Response(JSON.stringify({ error: 'Render cache not configured in this environment.' }), { status: 503 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
    }

    const { action } = body;

    // ── A. Purge a specific URL ──────────────────────────────────────────────
    if (action === 'purge_url') {
        let { path } = body;
        if (!path || typeof path !== 'string') {
            return new Response(JSON.stringify({ error: 'path is required' }), { status: 400 });
        }
        // Normalise: strip trailing slash, ensure leading slash
        path = '/' + path.replace(/^\//, '').replace(/\/$/, '');

        try {
            await invalidateCachedPage(env, [path]);
            return new Response(JSON.stringify({ success: true, purged: [path] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    // ── B. Purge all cached /search/* keys (one-time cleanup) ────────────────
    if (action === 'purge_search') {
        try {
            const listed = await env.RENDER_CACHE.list({ prefix: 'rendered/search' });
            const keys: string[] = listed.objects.map((o: any) => o.key);

            if (keys.length === 0) {
                return new Response(JSON.stringify({ success: true, deleted: 0, message: 'No search keys found in R2.' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Delete from R2 in batches of 1000
            for (let i = 0; i < keys.length; i += 1000) {
                await env.RENDER_CACHE.delete(keys.slice(i, i + 1000));
            }

            // Purge CF edge for each URL
            const pathnames = keys.map((k: string) => k.replace(/^rendered/, '').replace(/\.html$/, ''));
            const urls = pathnames.map((p: string) => `${PRODUCTION_ORIGIN}${p}`);
            await purgeEdgeUrls(env, urls);

            return new Response(JSON.stringify({ success: true, deleted: keys.length, paths: pathnames }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    // ── C. Scoped bulk purge by R2 cachedAt timestamp ────────────────────────
    if (action === 'purge_scoped') {
        const { window: windowStr } = body; // '1h' | '24h' | '7d' | '30d' | 'all'
        const windowMs: Record<string, number> = {
            '1h':  60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d':  7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            'all': Infinity,
        };
        const ms = windowMs[windowStr];
        if (ms === undefined) {
            return new Response(JSON.stringify({ error: 'Invalid window. Use: 1h, 24h, 7d, 30d, all' }), { status: 400 });
        }

        try {
            const allKeys = await listAllRenderedKeys(env.RENDER_CACHE);
            const cutoff = Date.now() - (ms === Infinity ? 0 : ms);

            const matching = ms === Infinity
                ? allKeys
                : allKeys.filter(k => {
                    if (!k.cachedAt) return false;
                    return new Date(k.cachedAt).getTime() >= cutoff;
                });

            if (matching.length === 0) {
                return new Response(JSON.stringify({ success: true, deleted: 0, paths: [] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Delete R2 keys in batches of 1000 (R2 bulk delete support)
            const keyStrings = matching.map(k => k.key);
            for (let i = 0; i < keyStrings.length; i += 1000) {
                await env.RENDER_CACHE.delete(keyStrings.slice(i, i + 1000));
            }

            const pathnames = matching.map(k => keyToPathname(k.key));
            const urls = pathnames.map(p => `${PRODUCTION_ORIGIN}${p}`);
            await purgeEdgeUrls(env, urls);

            return new Response(JSON.stringify({ success: true, deleted: matching.length, paths: pathnames }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    // ── D1. Purge By Collection ───────────────────────────────────────────────
    if (action === 'purge_collection') {
        try {
            const { collectionSlug } = body;
            const db = getDb(env);
            const colMatch = await db.select().from(collections).where(eq(collections.slug, collectionSlug)).limit(1);
            if (colMatch.length === 0) return new Response(JSON.stringify({ error: 'Collection not found' }), { status: 404 });
            
            const entriesData = await db.select({ id: entries.id, slug: entries.slug }).from(entries).where(eq(entries.collectionId, colMatch[0].id));
            
            const urls: string[] = [];
            const r2Keys: string[] = [];
            
            // Add collection archive page
            urls.push(`${PRODUCTION_ORIGIN}/${collectionSlug}`);
            r2Keys.push(`rendered/${collectionSlug}.html`);

            if (entriesData.length > 0) {
                const entryIds = entriesData.map(e => e.id);
                const canonicalMap = await getCanonicalUrls(db, entryIds);
                
                for (const e of entriesData) {
                    const prefix = canonicalMap[e.id];
                    const path = prefix ? `/${prefix}/${e.slug}` : `/${e.slug}`;
                    urls.push(`${PRODUCTION_ORIGIN}${path}`);
                    r2Keys.push(`rendered${path}.html`);
                }
            }
            
            for (let i = 0; i < r2Keys.length; i += 1000) {
                await env.RENDER_CACHE.delete(r2Keys.slice(i, i + 1000));
            }
            await purgeEdgeUrls(env, urls);
            
            return new Response(JSON.stringify({ success: true, deleted: r2Keys.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    // ── D2. Purge By Taxonomy ─────────────────────────────────────────────────
    if (action === 'purge_taxonomy') {
        try {
            const { taxonomySlug } = body;
            const db = getDb(env);
            const taxMatch = await db.select().from(taxonomies).where(eq(taxonomies.slug, taxonomySlug)).limit(1);
            if (taxMatch.length === 0) return new Response(JSON.stringify({ error: 'Taxonomy not found' }), { status: 404 });
            
            const tax = taxMatch[0];
            const termsData = await db.select({ slug: terms.slug }).from(terms).where(eq(terms.taxonomyId, tax.id));
            
            const urls: string[] = [];
            const r2Keys: string[] = [];
            
            // Add taxonomy umbrella archive page
            urls.push(`${PRODUCTION_ORIGIN}/${taxonomySlug}`);
            r2Keys.push(`rendered/${taxonomySlug}.html`);

            if (termsData.length > 0) {
                for (const t of termsData) {
                    const path = tax.omitTaxonomySlug ? `/${t.slug}` : `/${tax.slug}/${t.slug}`;
                    urls.push(`${PRODUCTION_ORIGIN}${path}`);
                    r2Keys.push(`rendered${path}.html`);
                }
            }
            
            for (let i = 0; i < r2Keys.length; i += 1000) {
                await env.RENDER_CACHE.delete(r2Keys.slice(i, i + 1000));
            }
            await purgeEdgeUrls(env, urls);
            
            return new Response(JSON.stringify({ success: true, deleted: r2Keys.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    // ── E. Purge everything ──────────────────────────────────────────────────
    if (action === 'purge_all') {
        try {
            const allKeys = await listAllRenderedKeys(env.RENDER_CACHE);

            // Delete all R2 keys in batches of 1000
            const keyStrings = allKeys.map(k => k.key);
            for (let i = 0; i < keyStrings.length; i += 1000) {
                await env.RENDER_CACHE.delete(keyStrings.slice(i, i + 1000));
            }

            // Purge CF edge for each URL individually (not purge_everything)
            const urls = allKeys.map(k => `${PRODUCTION_ORIGIN}${keyToPathname(k.key)}`);
            await purgeEdgeUrls(env, urls);

            return new Response(JSON.stringify({ success: true, deleted: allKeys.length }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
};
