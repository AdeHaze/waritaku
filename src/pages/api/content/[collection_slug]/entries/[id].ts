import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/db';
import { collections, entries, entryTerms, entryRevisions } from '../../../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { generateUniqueSlug } from '../../../../../lib/slug';
import { hasPermission, hasAnyPermission } from '../../../../../lib/permissions';
import { invalidateEntryCache } from '../../../../../lib/cache-invalidation';

export const PUT: APIRoute = async (ctx) => {
    const { request, params, locals } = ctx;
    const user = locals.user;
    const permissions = locals.permissions;
    if (!user || !permissions) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    if (!hasAnyPermission(permissions, 'entries', ['edit_own', 'edit_others'])) {
        return new Response(JSON.stringify({ error: 'Forbidden: insufficient role' }), { status: 403 });
    }

    const db = getDb(env);
    const { collection_slug, id } = params;
    const entryId = parseInt(id as string, 10);

    try {
        const colRes = await db.select().from(collections).where(eq(collections.slug, collection_slug as string)).limit(1);
        if (colRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Collection not found' }), { status: 404 });
        }
        const collectionId = colRes[0].id;

        // Verify entry belongs to collection
        const entryRes = await db.select().from(entries).where(and(eq(entries.id, entryId), eq(entries.collectionId, collectionId))).limit(1);
        if (entryRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Entry not found in this collection' }), { status: 404 });
        }

        const entry = entryRes[0];
        
        // Ownership check
        if (entry.authorId !== user.userId && !hasPermission(permissions, 'entries', 'edit_others')) {
            return new Response(JSON.stringify({ error: 'Forbidden: cannot edit others entries' }), { status: 403 });
        }
        if (entry.authorId === user.userId && !hasPermission(permissions, 'entries', 'edit_own')) {
            return new Response(JSON.stringify({ error: 'Forbidden: cannot edit own entries' }), { status: 403 });
        }

        const body = await request.json() as any;
        
        // Extract standard fields
        const { slug, status, publishedAt, selectedTerms, authorId, ...customData } = body;

        let initialSlug = slug || entryRes[0].slug;
        let finalSlug = await generateUniqueSlug(db, initialSlug, undefined, entryId);

        // Map password_protected status to published + visibility field
        let mappedStatus = status || entryRes[0].status;
        if (mappedStatus === 'password_protected') {
            mappedStatus = 'published';
            customData.visibility = 'password';
        }

        // Snapshot current state as a revision before updating
        const oldData = entryRes[0].data;
        const oldTerms = await db.select({ termId: entryTerms.termId })
            .from(entryTerms)
            .where(eq(entryTerms.entryId, entryId));
        await db.insert(entryRevisions).values({
            entryId,
            authorId: user.userId,
            data: JSON.stringify({
                slug: entryRes[0].slug,
                status: entryRes[0].status,
                ...JSON.parse(oldData || '{}'),
                terms: oldTerms.map(t => t.termId)
            }),
            createdAt: new Date().toISOString()
        });

        // Update Entry
        const updateFields: any = {
            slug: finalSlug,
            status: mappedStatus,
            data: JSON.stringify(customData),
            publishedAt: publishedAt || entryRes[0].publishedAt,
            updatedAt: new Date().toISOString(),
            version: sql`${entries.version} + 1`
        };

        // If authorId is provided and different from the current, check permissions
        let finalAuthorId = entryRes[0].authorId;
        if (authorId && parseInt(authorId, 10) !== finalAuthorId) {
            if (hasPermission(permissions, 'entries', 'edit_others')) {
                finalAuthorId = parseInt(authorId, 10);
            } else {
                 return new Response(JSON.stringify({ error: 'Forbidden: cannot change author' }), { status: 403 });
            }
        }
        updateFields.authorId = finalAuthorId;

        // Restore from trash if setting a non-trashed status
        if (mappedStatus !== 'trashed') {
            updateFields.deletedAt = null;
        }
        await db.update(entries).set(updateFields).where(eq(entries.id, entryId));

        // Update Taxonomy Terms
        if (selectedTerms && Array.isArray(selectedTerms)) {
            // Delete old mappings
            await db.delete(entryTerms).where(eq(entryTerms.entryId, entryId));
            
            // Insert new mappings
            for (const termId of selectedTerms) {
                await db.insert(entryTerms).values({
                    entryId,
                    termId: parseInt(termId, 10)
                });
            }
        }

        // Invalidate Cache
        const tIds = selectedTerms && Array.isArray(selectedTerms) ? selectedTerms.map(t => parseInt(t, 10)) : [];
        const waitUntil = (ctx.locals as any).cfContext?.waitUntil || (ctx as any).waitUntil;
        
        if (waitUntil) {
            waitUntil(invalidateEntryCache(env, collectionId, entryId, finalSlug, tIds));
        } else {
            invalidateEntryCache(env, collectionId, entryId, finalSlug, tIds).catch(console.error);
        }
        
        // Also invalidate old slug if it changed
        if (finalSlug !== entryRes[0].slug) {
            if (waitUntil) {
                waitUntil(invalidateEntryCache(env, collectionId, entryId, entryRes[0].slug, []));
            } else {
                invalidateEntryCache(env, collectionId, entryId, entryRes[0].slug, []).catch(console.error);
            }
        }

        return new Response(JSON.stringify({ success: true, id: entryId, slug: finalSlug }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};

export const DELETE: APIRoute = async (ctx) => {
    const { request, params, locals } = ctx;
    const user = locals.user;
    const permissions = locals.permissions;
    if (!user || !permissions) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    if (!hasAnyPermission(permissions, 'entries', ['delete_own', 'delete_others'])) {
        return new Response(JSON.stringify({ error: 'Forbidden: insufficient role' }), { status: 403 });
    }

    const db = getDb(env);
    const { collection_slug, id } = params;
    const entryId = parseInt(id as string, 10);

    try {
        const colRes = await db.select().from(collections).where(eq(collections.slug, collection_slug as string)).limit(1);
        if (colRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Collection not found' }), { status: 404 });
        }

        const entryRes = await db.select().from(entries).where(and(eq(entries.id, entryId), eq(entries.collectionId, colRes[0].id))).limit(1);
        if (entryRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Entry not found' }), { status: 404 });
        }
        const entry = entryRes[0];

        // Ownership check
        if (entry.authorId !== user.userId && !hasPermission(permissions, 'entries', 'delete_others')) {
            return new Response(JSON.stringify({ error: 'Forbidden: cannot delete others entries' }), { status: 403 });
        }
        if (entry.authorId === user.userId && !hasPermission(permissions, 'entries', 'delete_own')) {
            return new Response(JSON.stringify({ error: 'Forbidden: cannot delete own entries' }), { status: 403 });
        }

        // Check for permanent deletion flag
        const url = new URL(request.url);
        const permanent = url.searchParams.get('permanent') === 'true';

        if (permanent) {
            // Hard delete
            const oldTerms = await db.select({ termId: entryTerms.termId })
                .from(entryTerms)
                .where(eq(entryTerms.entryId, entryId));
            const tIds = oldTerms.map(t => t.termId);

            await db.delete(entryTerms).where(eq(entryTerms.entryId, entryId));
            await db.delete(entries).where(and(eq(entries.id, entryId), eq(entries.collectionId, colRes[0].id)));
            
            // Invalidate Cache
            const waitUntil = (ctx.locals as any).cfContext?.waitUntil || (ctx as any).waitUntil;
            if (waitUntil) {
                waitUntil(invalidateEntryCache(env, colRes[0].id, entryId, entryRes[0].slug, tIds));
            } else {
                invalidateEntryCache(env, colRes[0].id, entryId, entryRes[0].slug, tIds).catch(console.error);
            }

            return new Response(JSON.stringify({ success: true, permanent: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Soft delete: mark as trashed
        await db.update(entries).set({
            status: 'trashed',
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }).where(and(eq(entries.id, entryId), eq(entries.collectionId, colRes[0].id)));

        // Invalidate Cache
        const oldTerms = await db.select({ termId: entryTerms.termId })
            .from(entryTerms)
            .where(eq(entryTerms.entryId, entryId));
        const tIds = oldTerms.map(t => t.termId);
        const waitUntil = (ctx.locals as any).cfContext?.waitUntil || (ctx as any).waitUntil;
        if (waitUntil) {
            waitUntil(invalidateEntryCache(env, colRes[0].id, entryId, entryRes[0].slug, tIds));
        } else {
            invalidateEntryCache(env, colRes[0].id, entryId, entryRes[0].slug, tIds).catch(console.error);
        }

        return new Response(JSON.stringify({ success: true, trashed: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
