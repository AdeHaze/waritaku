/**
 * R2 Render Cache
 *
 * Stores pre-rendered HTML for public pages under the key prefix `rendered/`.
 * All functions are no-ops when env.RENDER_CACHE is absent (local dev).
 *
 * Key scheme:
 *   /             -> rendered/index.html
 *   /anime/slug   -> rendered/anime/slug.html
 *   /2026/08      -> rendered/2026/08.html
 */

import { getMediaBaseUrl } from './media';

const BYPASS_HEADER = 'X-Render-Cache-Bypass';
const BYPASS_VALUE = '1';
// 1-year TTL (HTTP maximum). Cache freshness is managed by explicit invalidateCachedPage()
// calls on publish/edit — passive time-based expiry is not relied upon.
const CACHE_CONTROL = 'public, max-age=31536000, stale-while-revalidate=86400';

/**
 * Rewrite Worker-proxied image URLs to direct R2 CDN URLs in HTML.
 *
 * Pages stored in R2 render cache must not contain /uploads/ or /api/images/
 * paths — those go through a Worker redirect which defeats the purpose of
 * caching. This function replaces them with the configured media base URL
 * so cached HTML is fully self-contained with direct R2 links.
 *
 * Handles both relative paths (/uploads/...) and absolute URLs
 * (https://waritaku.com/uploads/...) inside HTML attribute values.
 */
function rewriteMediaUrls(html: string): string {
    const mediaBase = getMediaBaseUrl();
    if (!mediaBase) return html; // Local dev: no rewriting
    const base = mediaBase.replace(/\/$/, '');

    // Absolute URLs — e.g. https://waritaku.com/uploads/2025/07/file.webp
    html = html.replaceAll(`https://waritaku.com/uploads/`, `${base}/`);
    html = html.replaceAll(`https://waritaku.com/api/images/`, `${base}/`);

    // Relative paths inside double-quoted HTML attributes
    html = html.replaceAll('="/uploads/', `="${base}/`);
    html = html.replaceAll('="/api/images/', `="${base}/`);

    // Relative paths inside single-quoted HTML attributes
    html = html.replaceAll("='/uploads/", `='${base}/`);
    html = html.replaceAll("='/api/images/", `='${base}/`);

    return html;
}

function pathToKey(pathname: string): string {
    const clean = pathname === '/' ? '/index' : pathname.replace(/\/$/, '');
    return `rendered${clean}.html`;
}

/**
 * Read a pre-rendered page from R2.
 * Returns a Response on HIT, or null on MISS / no binding.
 */
export async function getCachedPage(env: any, pathname: string): Promise<Response | null> {
    if (!env?.RENDER_CACHE) return null;
    if (import.meta.env.DEV) return null; // Always SSR in local dev

    const key = pathToKey(pathname);
    const object = await env.RENDER_CACHE.get(key);
    if (!object) return null;

    return new Response(object.body, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': CACHE_CONTROL,
            'X-Cache': 'HIT',
            'X-Cache-Key': key,
        },
    });
}

/**
 * Store an already-rendered HTML response in R2.
 *
 * The middleware calls this after a successful SSR render. It receives the
 * actual Response object (cloned) — there is NO self-fetch, so no second
 * SSR pass and no second round of D1 queries.
 *
 * Pass the Worker execution context (ctx) to run this in waitUntil (non-blocking).
 */
export async function cacheRenderedPage(env: any, pathname: string, response: Response, ctx?: ExecutionContext): Promise<void> {
    if (!env?.RENDER_CACHE) return;
    if (import.meta.env.DEV) return; // Never cache in local dev

    const work = async () => {
        try {
            if (response.status !== 200) return;
            const contentType = response.headers.get('Content-Type') || '';
            if (!contentType.includes('text/html')) return;

            // Rewrite Worker-proxied image paths to direct R2 CDN URLs
            // so cached HTML loads images without any redirect hops.
            const rawHtml = await response.clone().text();
            const html = rewriteMediaUrls(rawHtml);
            const key = pathToKey(pathname);

            await env.RENDER_CACHE.put(key, html, {
                httpMetadata: {
                    contentType: 'text/html; charset=utf-8',
                    cacheControl: CACHE_CONTROL,
                },
                customMetadata: {
                    url: pathname,
                    cachedAt: new Date().toISOString(),
                },
            });
        } catch (err) {
            console.error('[render-cache] cacheRenderedPage error:', err);
        }
    };

    if (ctx?.waitUntil) {
        ctx.waitUntil(work());
    } else {
        work().catch(console.error);
    }
}

/**
 * Purge a URL from Cloudflare's edge cache via the Cache Purge API.
 *
 * Required env vars (set as CF Pages secrets):
 *   CLOUDFLARE_ZONE_ID    — Zone ID from waritaku.com Overview sidebar
 *   CLOUDFLARE_CACHE_TOKEN — API token with Cache Purge permission only
 *
 * If either var is absent this is a silent no-op (e.g. local dev, staging).
 */
async function purgeEdgeCache(env: any, pathname: string): Promise<void> {
    const zoneId   = env?.CLOUDFLARE_ZONE_ID;
    const apiToken = env?.CLOUDFLARE_CACHE_TOKEN;
    if (!zoneId || !apiToken) return;

    const url = `https://waritaku.com${pathname}`;
    try {
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ files: [url] }),
            }
        );
        if (!res.ok) {
            const text = await res.text();
            console.error('[render-cache] Edge cache purge failed:', res.status, text);
        }
    } catch (err) {
        console.error('[render-cache] Edge cache purge error:', err);
    }
}

/**
 * Remove a pre-rendered page from R2 and Cloudflare edge cache.
 * Call this whenever an entry is published, updated, or deleted.
 */
export async function invalidateCachedPage(env: any, pathname: string): Promise<void> {
    if (!env?.RENDER_CACHE) return;
    if (import.meta.env.DEV) return;
    try {
        // Delete from R2 and purge from Cloudflare edge cache in parallel.
        await Promise.all([
            env.RENDER_CACHE.delete(pathToKey(pathname)),
            purgeEdgeCache(env, pathname),
        ]);
    } catch (err) {
        console.error('[render-cache] invalidateCachedPage error:', err);
    }
}

/**
 * Check whether an incoming request carries the render-cache bypass header.
 * Used by middleware to skip the R2 lookup for self-fetch requests.
 */
export function isBypassRequest(request: Request): boolean {
    return request.headers.get(BYPASS_HEADER) === BYPASS_VALUE;
}
