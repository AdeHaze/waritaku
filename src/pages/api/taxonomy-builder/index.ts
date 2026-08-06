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
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const body = await request.json() as any;
        const db = getDb(env);

        let allowedStr = '[]';
        if (Array.isArray(body.allowedCollections)) {
            allowedStr = JSON.stringify(body.allowedCollections);
        } else if (typeof body.allowedCollections === 'string') {
            allowedStr = body.allowedCollections;
        }

        let isRouted = body.isRouted === true || body.isRouted === 'true';
        const prefixEntryUrl = body.prefixEntryUrl === true || body.prefixEntryUrl === 'true';
        const entryUrlFormat = body.entryUrlFormat || 'default';
        const allowIndexing = body.allowIndexing !== false && body.allowIndexing !== 'false';
        const omitTaxonomySlug = body.omitTaxonomySlug === true || body.omitTaxonomySlug === 'true';

        const umbrellaViewMode = body.umbrellaViewMode || 'child_terms';
        const umbrellaAllowIndexing = body.umbrellaAllowIndexing !== false && body.umbrellaAllowIndexing !== 'false';
        const umbrellaItemsPerPage = parseInt(body.umbrellaItemsPerPage) || 0;

        if (prefixEntryUrl) {
            isRouted = true;
        }
        if (omitTaxonomySlug && !isRouted) {
            return new Response(JSON.stringify({ error: 'Cannot omit taxonomy slug if archive pages are disabled' }), { status: 400 });
        }

        const newTaxonomy = await db.insert(taxonomies).values({
            label: body.label,
            slug: body.slug,
            description: body.description || '',
            allowedCollections: allowedStr,
            isRouted: isRouted,
            prefixEntryUrl: prefixEntryUrl,
            entryUrlFormat: entryUrlFormat,
            allowIndexing: allowIndexing,
            omitTaxonomySlug: omitTaxonomySlug,
            umbrellaViewMode: umbrellaViewMode,
            umbrellaAllowIndexing: umbrellaAllowIndexing,
            umbrellaItemsPerPage: umbrellaItemsPerPage,
        }).returning();

        return new Response(JSON.stringify(newTaxonomy[0]), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
