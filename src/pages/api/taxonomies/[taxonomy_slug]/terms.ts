import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { taxonomies, terms } from '../../../../db/schema';
import { eq, desc, asc, like, and, or, inArray, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { generateUniqueSlug } from '../../../../lib/slug';
import { hasPermission } from '../../../../lib/permissions';

export const GET: APIRoute = async ({ params, request, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    const { taxonomy_slug } = params;

    try {
        const taxRes = await db.select().from(taxonomies).where(eq(taxonomies.slug, taxonomy_slug as string)).limit(1);
        if (taxRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Taxonomy not found' }), { status: 404 });
        }
        
        const url = new URL(request.url);
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
        const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get('limit') || '50')));
        const search = url.searchParams.get('search') || '';
        const sort = url.searchParams.get('sort') || 'id_desc'; // id_desc, name_asc, name_desc, slug_asc
        
        const includeIdsParam = url.searchParams.get('include_ids');
        const includeIds = includeIdsParam ? includeIdsParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : [];

        let baseConditions: any = eq(terms.taxonomyId, taxRes[0].id);
        let conditions = baseConditions;

        if (search) {
            const searchPattern = `%${search}%`;
            let searchCondition = or(like(terms.name, searchPattern), like(terms.slug, searchPattern));
            if (includeIds.length > 0) {
                searchCondition = or(searchCondition, inArray(terms.id, includeIds));
            }
            conditions = and(baseConditions, searchCondition);
        } else if (includeIds.length > 0) {
            // When not searching but there are included IDs, we still want to make sure they are returned.
            // A simple way is to just fetch the normal page. The client will handle keeping selected terms around.
            // Or we could return them regardless of the pagination. Let's just rely on normal pagination if no search.
            // Actually, if we're not searching, we should ensure the selected IDs are included in the results
            // if they are not in the first 50. But for simplicity, we'll let the client handle merging previously loaded selected terms.
            // The main issue is when we DO search, the selected terms might disappear from the list.
            // So the condition above handles it for search.
        }

        // Count
        const countRes = await db.select({ count: sql<number>`count(*)` })
            .from(terms)
            .where(conditions);
        const total = countRes[0]?.count || 0;

        // Sort
        let orderFn = desc(terms.id);
        if (sort === 'name_asc') orderFn = asc(terms.name);
        else if (sort === 'name_desc') orderFn = desc(terms.name);
        else if (sort === 'slug_asc') orderFn = asc(terms.slug);

        let results = await db.select()
            .from(terms)
            .where(conditions)
            .orderBy(orderFn)
            .limit(limit)
            .offset((page - 1) * limit);
            
        // If there's no search, but we have include_ids, make sure they are in the result set
        if (!search && includeIds.length > 0 && page === 1) {
            const missingIds = includeIds.filter(id => !results.find(r => r.id === id));
            if (missingIds.length > 0) {
                const missingTerms = await db.select().from(terms).where(and(baseConditions, inArray(terms.id, missingIds)));
                // Prepend them to the results
                results = [...missingTerms, ...results];
            }
        }

        return new Response(JSON.stringify({ data: results, total, page, limit }), {
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
    const { taxonomy_slug } = params;

    try {
        const permissions = locals.permissions;
        if (!permissions || !hasPermission(permissions, 'taxonomies', 'create')) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
        }

        const taxRes = await db.select().from(taxonomies).where(eq(taxonomies.slug, taxonomy_slug as string)).limit(1);
        if (taxRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Taxonomy not found' }), { status: 404 });
        }
        
        const body = await request.json() as any;
        
        let initialSlug = body.slug || body.name;
        const finalSlug = await generateUniqueSlug(db, initialSlug, 'term', undefined, Boolean(taxRes[0].omitTaxonomySlug));

        const inserted = await db.insert(terms).values({
            taxonomyId: taxRes[0].id,
            authorId: user.userId,
            name: body.name,
            slug: finalSlug
        }).returning({ id: terms.id });

        return new Response(JSON.stringify({ success: true, id: inserted[0].id }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
