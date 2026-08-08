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

const PRODUCTION_ORIGIN = 'https://waritaku.com';
const BYPASS_HEADER = 'X-Render-Cache-Bypass';
const BYPASS_VALUE = '1';
const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=3600';

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

    const key = pathToKey(pathname);
    const object = await env.RENDER_CACHE.get(key);
    if (!object) return null;

    const body = await object.arrayBuffer();
    return new Response(body, {
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
 * Fetch the given path from the production origin and write the HTML to R2.
 * Pass the Worker execution context (ctx) to run this in waitUntil (non-blocking).
 */
export async function renderAndCache(env: any, pathname: string, ctx?: ExecutionContext): Promise<void> {
    if (!env?.RENDER_CACHE) return;

    const work = async () => {
        try {
            const url = PRODUCTION_ORIGIN + pathname;
            const response = await fetch(url, {
                headers: { [BYPASS_HEADER]: BYPASS_VALUE },
                redirect: 'manual',
            });

            if (response.status !== 200) return;
            const contentType = response.headers.get('Content-Type') || '';
            if (!contentType.includes('text/html')) return;

            const html = await response.arrayBuffer();
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
            console.error('[render-cache] renderAndCache error:', err);
        }
    };

    if (ctx?.waitUntil) {
        ctx.waitUntil(work());
    } else {
        work().catch(console.error);
    }
}

/**
 * Remove a pre-rendered page from R2 (e.g. on trash or permanent delete).
 */
export async function invalidateCachedPage(env: any, pathname: string): Promise<void> {
    if (!env?.RENDER_CACHE) return;
    try {
        await env.RENDER_CACHE.delete(pathToKey(pathname));
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
