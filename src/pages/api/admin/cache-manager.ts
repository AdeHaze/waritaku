import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hasPermission } from '../../../lib/permissions';
import { invalidateCachedPage } from '../../../lib/render-cache';

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
    const chunks: string[][] = [];
    for (let i = 0; i < urls.length; i += 30) {
        chunks.push(urls.slice(i, i + 30));
    }
    await Promise.all(chunks.map(chunk =>
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

            // Delete from R2
            await Promise.all(keys.map((k: string) => env.RENDER_CACHE.delete(k)));

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

            // Delete R2 keys in batches of 100
            for (let i = 0; i < matching.length; i += 100) {
                await Promise.all(matching.slice(i, i + 100).map(k => env.RENDER_CACHE.delete(k.key)));
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

    // ── C. Purge everything ──────────────────────────────────────────────────
    if (action === 'purge_all') {
        try {
            const allKeys = await listAllRenderedKeys(env.RENDER_CACHE);

            // Delete all R2 keys in batches of 100
            for (let i = 0; i < allKeys.length; i += 100) {
                await Promise.all(allKeys.slice(i, i + 100).map(k => env.RENDER_CACHE.delete(k.key)));
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
