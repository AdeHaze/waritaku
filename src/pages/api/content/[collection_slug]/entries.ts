import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { collections, entries, terms, entryTerms, users } from '../../../../db/schema';
import { eq, and, sql, desc, like } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ request, params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    const { collection_slug } = params;
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || '';
    const date = url.searchParams.get('date') || ''; // YYYY-MM-DD
    const termId = url.searchParams.get('termId') || '';

    try {
        const colRes = await db.select().from(collections).where(eq(collections.slug, collection_slug as string)).limit(1);
        if (colRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Collection not found' }), { status: 404 });
        }
        const collectionId = colRes[0].id;

        let conditions: any = eq(entries.collectionId, collectionId);
        
        if (search) {
            conditions = and(conditions, like(entries.data, `%${search}%`));
        }
        if (status) {
            conditions = and(conditions, eq(entries.status, status));
        }
        if (date) {
            // Match publishedAt string prefix e.g. 2026-08-01
            conditions = and(conditions, like(entries.publishedAt, `${date}%`));
        }
        if (termId) {
            // Find entry IDs that have this termId attached
            const termEntries = await db.select({ entryId: entryTerms.entryId })
                .from(entryTerms)
                .where(eq(entryTerms.termId, parseInt(termId)));
            
            const eIds = termEntries.map(te => te.entryId);
            if (eIds.length > 0) {
                // Because Drizzle in-array can fail with empty array, we only add the condition if eIds has items
                const { inArray } = await import('drizzle-orm');
                conditions = and(conditions, inArray(entries.id, eIds));
            } else {
                // No entries match this term — return empty result immediately
                return new Response(JSON.stringify({ data: [], total: 0, page, limit }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        const countRes = await db.select({ count: sql<number>`count(*)` })
            .from(entries)
            .where(conditions);
        const total = countRes[0]?.count || 0;

        const results = await db.select({
            entry: entries,
            author: users
        })
        .from(entries)
        .leftJoin(users, eq(entries.authorId, users.id))
        .where(conditions)
        .orderBy(desc(entries.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

        // Fetch terms for all returned entries
        const entryIds = results.map(r => r.entry.id);
        
        let allTerms: any[] = [];
        if (entryIds.length > 0) {
            const { inArray } = await import('drizzle-orm');
            const { taxonomies } = await import('../../../../db/schema');
            allTerms = await db.select({
                entryId: entryTerms.entryId,
                term: terms,
                taxonomy: taxonomies
            })
            .from(entryTerms)
            .innerJoin(terms, eq(entryTerms.termId, terms.id))
            .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
            .where(inArray(entryTerms.entryId, entryIds));
        }

        // Group terms by entryId
        const termsByEntry: Record<number, any[]> = {};
        allTerms.forEach(t => {
            if (!termsByEntry[t.entryId]) termsByEntry[t.entryId] = [];
            termsByEntry[t.entryId].push({ 
                id: t.term.id, 
                name: t.term.name, 
                slug: t.term.slug,
                taxonomyLabel: t.taxonomy.label
            });
        });

        const items = results.map(r => {
            let parsedData: any;
            try { parsedData = JSON.parse(r.entry.data || '{}'); } catch { parsedData = {}; }
            const { password, ...safeData } = parsedData;
            return {
                id: r.entry.id,
                slug: r.entry.slug,
                status: r.entry.status,
                createdAt: r.entry.createdAt,
                publishedAt: r.entry.publishedAt,
                authorName: r.author?.name || 'Unknown',
                terms: termsByEntry[r.entry.id] || [],
                ...safeData
            };
        });

        return new Response(JSON.stringify({ data: items, total, page, limit }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request, params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    const { collection_slug } = params;

    try {
        const colRes = await db.select().from(collections).where(eq(collections.slug, collection_slug as string)).limit(1);
        if (colRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Collection not found' }), { status: 404 });
        }
        const collectionId = colRes[0].id;

        const body = await request.json() as any;
        
        // Extract standard fields
        const { slug, status, publishedAt, selectedTerms, ...customData } = body;

        // Auto-generate slug if missing
        let finalSlug = slug;
        if (!finalSlug) {
             const title = customData.title || customData.name || 'entry';
             finalSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now().toString().slice(-4);
        }

        // Insert Entry
        const inserted = await db.insert(entries).values({
            collectionId,
            authorId: user.userId,
            slug: finalSlug,
            status: status || 'draft',
            data: JSON.stringify(customData),
            publishedAt: publishedAt || new Date().toISOString()
        }).returning({ id: entries.id });

        const entryId = inserted[0].id;

        // Map Taxonomy Terms
        if (selectedTerms && Array.isArray(selectedTerms)) {
            for (const termId of selectedTerms) {
                await db.insert(entryTerms).values({
                    entryId,
                    termId: parseInt(termId, 10)
                });
            }
        }

        return new Response(JSON.stringify({ success: true, id: entryId, slug: finalSlug }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
