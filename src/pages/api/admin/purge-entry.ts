import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { collections, entries, entryTerms } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { hasAnyPermission } from '../../../lib/permissions';
import { invalidateEntryCache } from '../../../lib/cache-invalidation';

export const POST: APIRoute = async (ctx) => {
    const { locals, request } = ctx;
    const user = locals.user;
    const permissions = locals.permissions;

    if (!user || !permissions) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    if (!hasAnyPermission(permissions, 'entries', ['edit_own', 'edit_others'])) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    if (!env?.RENDER_CACHE) {
        return new Response(JSON.stringify({ error: 'Render cache not available in this environment.' }), { status: 503 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
    }

    const { entryId, collectionSlug } = body;
    if (!entryId || !collectionSlug) {
        return new Response(JSON.stringify({ error: 'entryId and collectionSlug are required' }), { status: 400 });
    }

    const db = getDb(env);

    try {
        const colRes = await db.select({ id: collections.id })
            .from(collections)
            .where(eq(collections.slug, collectionSlug as string))
            .limit(1);
        if (colRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Collection not found' }), { status: 404 });
        }
        const collectionId = colRes[0].id;

        const entryRes = await db.select({ id: entries.id, slug: entries.slug, authorId: entries.authorId })
            .from(entries)
            .where(and(eq(entries.id, parseInt(entryId, 10)), eq(entries.collectionId, collectionId)))
            .limit(1);
        if (entryRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Entry not found' }), { status: 404 });
        }
        const entry = entryRes[0];

        if (entry.authorId !== user.userId && !hasAnyPermission(permissions, 'entries', ['edit_others'])) {
            return new Response(JSON.stringify({ error: 'Forbidden: cannot purge others entries' }), { status: 403 });
        }

        const termRows = await db.select({ termId: entryTerms.termId })
            .from(entryTerms)
            .where(eq(entryTerms.entryId, entry.id));
        const termIds = termRows.map(t => t.termId);

        const waitCtx = (ctx.locals as any).cfContext;
        if (waitCtx?.waitUntil) {
            waitCtx.waitUntil(invalidateEntryCache(env, collectionId, entry.id, entry.slug, termIds));
        } else {
            await invalidateEntryCache(env, collectionId, entry.id, entry.slug, termIds);
        }

        return new Response(JSON.stringify({ success: true, slug: entry.slug }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || 'Internal error' }), { status: 500 });
    }
};
