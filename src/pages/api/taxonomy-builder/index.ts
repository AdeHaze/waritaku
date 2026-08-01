import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { taxonomies } from '../../../db/schema';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const db = getDb(env);
        const allTaxonomies = await db.select().from(taxonomies);
        return new Response(JSON.stringify(allTaxonomies), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const body = await request.json();
        const db = getDb(env);

        let allowedStr = '[]';
        if (Array.isArray(body.allowedCollections)) {
            allowedStr = JSON.stringify(body.allowedCollections);
        } else if (typeof body.allowedCollections === 'string') {
            allowedStr = body.allowedCollections;
        }

        const newTaxonomy = await db.insert(taxonomies).values({
            label: body.label,
            slug: body.slug,
            description: body.description || '',
            allowedCollections: allowedStr,
            isRouted: body.isRouted === true || body.isRouted === 'true',
            prefixEntryUrl: body.prefixEntryUrl === true || body.prefixEntryUrl === 'true',
            allowIndexing: body.allowIndexing !== false && body.allowIndexing !== 'false',
        }).returning();

        return new Response(JSON.stringify(newTaxonomy[0]), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
