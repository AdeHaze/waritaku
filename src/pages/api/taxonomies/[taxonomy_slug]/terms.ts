import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { taxonomies, terms } from '../../../../db/schema';
import { eq, desc, asc, like, and, or, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { generateUniqueSlug } from '../../../../lib/slug';

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

        let conditions: any = eq(terms.taxonomyId, taxRes[0].id);
        
        if (search) {
            const searchPattern = `%${search}%`;
            conditions = and(conditions, or(like(terms.name, searchPattern), like(terms.slug, searchPattern)));
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

        const results = await db.select()
            .from(terms)
            .where(conditions)
            .orderBy(orderFn)
            .limit(limit)
            .offset((page - 1) * limit);

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
        const taxRes = await db.select().from(taxonomies).where(eq(taxonomies.slug, taxonomy_slug as string)).limit(1);
        if (taxRes.length === 0) {
            return new Response(JSON.stringify({ error: 'Taxonomy not found' }), { status: 404 });
        }
        
        const body = await request.json() as any;
        
        let initialSlug = body.slug || body.name;
        const finalSlug = await generateUniqueSlug(db, initialSlug);

        const inserted = await db.insert(terms).values({
            taxonomyId: taxRes[0].id,
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
