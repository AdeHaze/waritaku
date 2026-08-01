import { defineMiddleware } from 'astro:middleware';
import { verifySessionCookie } from './lib/auth';
import { getDb } from './lib/db';
import { redirects, notFoundLogs, settings } from './db/schema';
import { eq, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const onRequest = defineMiddleware(async (context, next) => {
    const url = new URL(context.request.url);
    const db = getDb(env);

    let enableRedirections = true;
    let enable404Tracking = true;

    if (db) {
        try {
            const configRow = await db.select().from(settings).where(eq(settings.key, 'general_settings')).get();
            if (configRow) {
                const config = JSON.parse(configRow.value);
                enableRedirections = config.enableRedirections !== false;
                enable404Tracking = config.enable404Tracking !== false;
            }
        } catch(e) {}
    }

    // --- 0. Redirect Engine ---
    if (db && enableRedirections) {
        const redirect = await db.select().from(redirects).where(eq(redirects.sourceUrl, url.pathname)).get();
        if (redirect) {
            // Increment hit counter asynchronously without blocking the response
            const updatePromise = db.update(redirects).set({ hits: sql`${redirects.hits} + 1` }).where(eq(redirects.id, redirect.id)).execute();
            const ctx = (context.locals as any).cfContext || (context.locals as any).runtime?.ctx;
            if (ctx && ctx.waitUntil) {
                ctx.waitUntil(updatePromise);
            } else {
                updatePromise.catch(console.error);
            }
            return context.redirect(redirect.targetUrl, redirect.statusCode as 301 | 302);
        }
    }
    
    // 1. Force trailing slash redirect (except root)
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
        return context.redirect(url.toString(), 301);
    }

    // 2. Protect /admin and /api routes (except /admin/login and public APIs if needed)
    if ((url.pathname.startsWith('/admin') && url.pathname !== '/admin/login') || url.pathname.startsWith('/api')) {
        const sessionCookie = context.cookies.get('session')?.value;
        
        if (!sessionCookie) {
            if (url.pathname.startsWith('/api')) {
                // Let the API route handle the missing user context (it will see locals.user is undefined)
            } else {
                return context.redirect('/admin/login', 302);
            }
        } else {
            const payload = await verifySessionCookie(sessionCookie);
            if (payload) {
                context.locals.user = {
                    userId: payload.userId,
                    role: payload.role,
                    name: payload.name,
                    email: payload.email
                };
            } else {
                context.cookies.delete('session', { path: '/' });
                if (url.pathname.startsWith('/api')) {
                    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
                }
                return context.redirect('/admin/login', 302);
            }
        }
    }
    
    const response = await next();

    // --- 3. 404 Logging Engine ---
    if (response.status === 404 && db && enable404Tracking) {
        // Skip logging for Vite internal files during dev to prevent noise
        if (!url.pathname.startsWith('/@') && !url.pathname.startsWith('/node_modules') && url.pathname !== '/favicon.ico') {
             // We can't use waitUntil safely here in local dev without the context runtime, so we just await it if needed
             // But to keep it fast, we can just fire and forget the Promise in Node/Vite, or use ctx.waitUntil on Edge.
             const logPromise = db.insert(notFoundLogs)
                  .values({ url: url.pathname, hits: 1 })
                  .onConflictDoUpdate({
                      target: notFoundLogs.url,
                      set: { hits: sql`${notFoundLogs.hits} + 1`, lastSeen: new Date().toISOString() }
                  }).execute();
                  
             const ctx = (context.locals as any).cfContext || (context.locals as any).runtime?.ctx;
             if (ctx && ctx.waitUntil) {
                 ctx.waitUntil(logPromise);
             } else {
                 logPromise.catch(console.error); // Fire and forget in local dev
             }
        }
    }

    return response;
});
