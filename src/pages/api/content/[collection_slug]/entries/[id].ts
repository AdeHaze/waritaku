import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/db';
import { collections, entries, entryTerms } from '../../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const PUT: APIRoute = async ({ request, params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
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

        const body = await request.json();
        
        // Extract standard fields
        const { slug, status, publishedAt, selectedTerms, ...customData } = body;

        let finalSlug = slug || entryRes[0].slug;

        // Update Entry
        await db.update(entries).set({
            slug: finalSlug,
            status: status || entryRes[0].status,
            data: JSON.stringify(customData),
            publishedAt: publishedAt || entryRes[0].publishedAt,
            updatedAt: new Date().toISOString()
        }).where(eq(entries.id, entryId));

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

        return new Response(JSON.stringify({ success: true, id: entryId, slug: finalSlug }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    const { collection_slug, id } = params;
    const entryId = parseInt(id as string, 10);

    try {
        const colRes = await db.select().from(collections).where(eq(collections.slug, collection_slug as string)).limit(1);
        if (colRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Collection not found' }), { status: 404 });
        }

        // Delete entry terms first due to FK constraints (handled implicitly by cascade usually, but safe to be explicit)
        await db.delete(entryTerms).where(eq(entryTerms.entryId, entryId));
        
        // Delete entry
        await db.delete(entries).where(and(eq(entries.id, entryId), eq(entries.collectionId, colRes[0].id)));

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
