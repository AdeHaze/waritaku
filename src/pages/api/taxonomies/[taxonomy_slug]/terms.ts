import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { taxonomies, terms } from '../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params, locals }) => {
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
        
        const results = await db.select()
            .from(terms)
            .where(eq(terms.taxonomyId, taxRes[0].id))
            .orderBy(desc(terms.id));

        return new Response(JSON.stringify({ data: results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
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
        
        const body = await request.json();
        
        let slug = body.slug;
        if (!slug && body.name) {
            slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        }

        const inserted = await db.insert(terms).values({
            taxonomyId: taxRes[0].id,
            name: body.name,
            slug
        }).returning({ id: terms.id });

        return new Response(JSON.stringify({ success: true, id: inserted[0].id }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
