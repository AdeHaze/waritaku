import { defineMiddleware } from 'astro:middleware';
import { verifySessionCookie } from './lib/auth';
import { getDb } from './lib/db';
import { redirects, notFoundLogs, settings } from './db/schema';
import { eq, sql } from 'drizzle-orm';
import { getCachedPage, cacheRenderedPage, isBypassRequest } from './lib/render-cache';
import { loadUserPermissions } from './lib/permissions';
import { useTranslation } from './i18n';

// Paths that must never be served from the R2 render cache.
// Static file extensions are matched by the dot check further below.
// /search is excluded because results are query-string-dependent and must always be live.
const CACHE_BYPASS_PREFIXES = ['/admin', '/api', '/uploads', '/@', '/node_modules', '/search'];

function isPublicHtmlPath(pathname: string): boolean {
    // Skip any path that belongs to a bypass prefix
    if (CACHE_BYPASS_PREFIXES.some(p => pathname.startsWith(p))) return false;
    // Skip static assets (anything with a file extension)
    const lastSegment = pathname.split('/').pop() ?? '';
    if (lastSegment.includes('.')) return false;
    return true;
}

// Simple in-memory settings cache with 60s TTL
let settingsCache: { config: any; timestamp: number } | null = null;
const SETTINGS_CACHE_TTL = 60_000; // 60 seconds

// Simple in-memory redirects cache with 60s TTL
let redirectsCache: { map: Record<string, any>; timestamp: number } | null = null;
const REDIRECTS_CACHE_TTL = 60_000;

import { env } from 'cloudflare:workers';

export const onRequest = defineMiddleware(async (context, next) => {
    const url = new URL(context.request.url);

    
    // 1. Force trailing slash redirect (except root)
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
        return context.redirect(url.toString(), 301);
    }


    // --- Intercept legacy WP /feed URLs ---
    if (url.pathname.endsWith('/feed') || url.pathname.endsWith('/feed/')) {
        const cleanPath = url.pathname.replace(/\/feed\/?$/, '');
        return context.redirect(cleanPath || '/', 301);
    }

    // --- R2 Render Cache short-circuit ---
    // Runs before any D1 query. Visitor read traffic for public HTML pages
    // is served entirely from R2 + Cloudflare edge cache.
    // NOTE: requests asking for text/markdown or application/json bypass the
    // cache so the SSR route can run its markdown conversion (cached HTML is
    // not markdown).
    const wantsMarkdown = (context.request.headers.get('Accept') || '').includes('text/markdown')
        || (context.request.headers.get('Accept') || '').includes('application/json');
    if (isPublicHtmlPath(url.pathname) && !isBypassRequest(context.request) && !wantsMarkdown) {
        const cached = await getCachedPage(env, url.pathname);
        if (cached) {
            // Apply security headers to cached responses too
            cached.headers.set('X-Content-Type-Options', 'nosniff');
            cached.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
            cached.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            return cached;
        }
    }
    // Cache MISS (or non-cacheable path) — fall through to the normal SSR path below.

    let db;
    try {
        db = getDb(env);
    } catch (err: any) {
        const errorMsg = `Initialization Error: ${err.message}. Env keys available: ${env ? JSON.stringify(Object.keys(env)) : 'none'}`;
        const padding = ' '.repeat(512); // Prevent Chrome from hiding small 500 responses
        return new Response(`${errorMsg}\n\n${padding}`, { status: 500, headers: { 'Content-Type': 'text/plain' }});
    }

    let enableRedirections = true;
    let enable404Tracking = true;

    if (db) {
        const now = Date.now();
        if (settingsCache && (now - settingsCache.timestamp) < SETTINGS_CACHE_TTL) {
            enableRedirections = settingsCache.config.enableRedirections !== false;
            enable404Tracking = settingsCache.config.enable404Tracking !== false;
        } else {
            try {
                const configRow = await db.select().from(settings).where(eq(settings.key, 'general_settings')).get();
                if (configRow) {
                    const config = JSON.parse(configRow.value);
                    settingsCache = { config, timestamp: now };
                    enableRedirections = config.enableRedirections !== false;
                    enable404Tracking = config.enable404Tracking !== false;
                }
            } catch(e) {}
        }
        if (settingsCache) {
            (context.locals as any).generalSettings = settingsCache.config;
        }
    }

    // Set up i18n from the cached config language
    const language = settingsCache?.config?.language || 'id';
    context.locals.t = useTranslation(language);

    // --- 0. Redirect Engine ---
    if (db && enableRedirections) {
        const now = Date.now();
        if (!redirectsCache || (now - redirectsCache.timestamp) > REDIRECTS_CACHE_TTL) {
            try {
                const allRedirects = await db.select().from(redirects).all();
                const map: Record<string, any> = {};
                for (const r of allRedirects) {
                    map[r.sourceUrl] = r;
                }
                redirectsCache = { map, timestamp: now };
            } catch (e) {
                console.error("Failed to fetch redirects cache", e);
            }
        }
        
        const redirect = redirectsCache?.map[url.pathname];
        if (redirect) {
            // Increment hit counter asynchronously without blocking the response
            const updatePromise = db.update(redirects).set({ hits: sql`${redirects.hits} + 1` }).where(eq(redirects.id, redirect.id)).execute();
            let ctx = (context.locals as any).cfContext;
            if (!ctx) {
                try { ctx = (context.locals as any).runtime?.ctx; } catch(e) {}
            }
            if (!ctx) {
                ctx = (context.locals as any).ctx || (context.locals as any).runtime;
            }
            if (ctx && ctx.waitUntil) {
                ctx.waitUntil(updatePromise);
            } else {
                updatePromise.catch(console.error);
            }
            return context.redirect(redirect.targetUrl, redirect.statusCode as 301 | 302);
        }
    }

    // 2. Protect /admin and /api routes (except public auth routes)
    const publicAdminRoutes = ['/admin/login', '/admin/forgot-password', '/admin/reset-password'];
    if ((url.pathname.startsWith('/admin') && !publicAdminRoutes.includes(url.pathname)) || url.pathname.startsWith('/api')) {
        const sessionCookie = context.cookies.get('session')?.value;
        
        if (!sessionCookie) {
            if (url.pathname.startsWith('/api')) {
                // Let the API route handle the missing user context (it will see locals.user is undefined)
            } else {
                return context.redirect('/admin/login', 302);
            }
        } else {
            const payload = await verifySessionCookie(sessionCookie, env?.JWT_SECRET);
            if (payload) {
                context.locals.user = {
                    userId: payload.userId,
                    role: payload.role,
                    name: payload.name,
                    email: payload.email
                };
                // Load permission set for this role (single DB query, cached by role)
                context.locals.permissions = await loadUserPermissions(db, payload.role);
            } else {
                context.cookies.delete('session', { path: '/' });
                if (url.pathname.startsWith('/api')) {
                    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
                }
                return context.redirect('/admin/login', 302);
            }
        }
    }
    
    try {
        const raw = await next();

        // Response.redirect() and some Astro internals return responses with immutable
        // headers. Wrap in a new Response so we can always set security headers safely.
        const response = new Response(raw.body, {
            status: raw.status,
            statusText: raw.statusText,
            headers: new Headers(raw.headers),
        });

        // --- 3. Security headers ---
        // CSP: 'unsafe-inline' needed for Astro is:inline scripts; script-src includes
        // Twitter embed + Google AdSense (pagead2, doubleclick, fundingchoices, tpc,
        // adtrafficquality SODAR) + Cloudflare Insights beacon + Disqus comments
        // (waritaku.disqus.com + disquscdn.com assets); connect-src covers
        // AdSense API + SODAR + Chrome RUM (csi.gstatic.com — separate from *.google.com);
        // frame-src allows embeds (YouTube, Twitter, Vimeo, Spotify, SoundCloud, AdSense iframes)
        response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://platform.twitter.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://static.doubleclick.net https://fundingchoicesmessages.google.com https://static.cloudflareinsights.com https://*.adtrafficquality.google https://*.disqus.com https://*.disquscdn.com https://d-code.liadm.com; style-src 'self' 'unsafe-inline' https://*.disquscdn.com; img-src 'self' https: data:; font-src 'self'; connect-src 'self' https://pagead2.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://*.cloudflareinsights.com https://*.gstatic.com https://*.disqus.com https://*.disquscdn.com https://d-code.liadm.com; frame-src https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com https://platform.twitter.com https://twitter.com https://x.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://www.googletagservices.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google https://*.disqus.com https://disqus.com https://*.disquscdn.com");
        response.headers.set('X-Content-Type-Options', 'nosniff');
        response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        if (url.pathname.startsWith('/admin')) {
            response.headers.set('X-Frame-Options', 'DENY');
        }

        // --- Search pages must never be cached by Cloudflare edge ---
        // Our R2 layer already skips /search (CACHE_BYPASS_PREFIXES), but CF
        // edge cache sits in front of the Worker and caches based on
        // Cache-Control headers. Setting no-store here prevents CF from ever
        // serving a stale search result to another visitor.
        if (url.pathname.startsWith('/search')) {
            response.headers.set('Cache-Control', 'private, no-store');
            response.headers.set('Vary', 'Accept');
        }
        // --- R2 lazy cache population ---
        // On a cache MISS, if SSR returned a 200 HTML page for a public path,
        // write the rendered HTML to R2 in the background so the next request
        // is served from cache with zero D1 queries. The response is cloned
        // here (body stream tee) — no self-fetch, no second SSR pass.
        let ctx = (context.locals as any).cfContext;
        if (!ctx) {
            try { ctx = (context.locals as any).runtime?.ctx; } catch(e) {}
        }
        if (!ctx) {
            ctx = (context.locals as any).ctx || (context.locals as any).runtime;
        }
        if (
            response.status === 200 &&
            (response.headers.get('Content-Type') ?? '').includes('text/html') &&
            isPublicHtmlPath(url.pathname)
        ) {
            const cacheClone = response.clone();
            cacheRenderedPage(env, url.pathname, cacheClone, ctx);
        }

        // --- 4. 404 Logging Engine ---
        if (response.status === 404 && db && enable404Tracking) {
            // Skip logging for Vite internal files during dev to prevent noise
            if (!url.pathname.startsWith('/@') && !url.pathname.startsWith('/node_modules') && url.pathname !== '/favicon.ico') {
                 const logPromise = db.insert(notFoundLogs)
                      .values({ url: url.pathname, hits: 1 })
                      .onConflictDoUpdate({
                          target: notFoundLogs.url,
                          set: { hits: sql`${notFoundLogs.hits} + 1`, lastSeen: new Date().toISOString() }
                      }).execute();
                      
                 if (ctx && ctx.waitUntil) {
                     ctx.waitUntil(logPromise);
                 } else {
                     logPromise.catch(console.error); // Fire and forget in local dev
                 }
            }
        }

        return response;
    } catch (e: any) {
        return new Response(`Error: ${e.message}\nStack: ${e.stack}`, { status: 500, headers: { 'Content-Type': 'text/plain' } });
    }
});
