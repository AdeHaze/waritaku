import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { taxonomies } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const PUT: APIRoute = async ({ params, request, locals }) => {
    const user = locals.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const id = parseInt(params.id || '0', 10);
        if (!id) return new Response('Invalid ID', { status: 400 });

        const body = await request.json();
        const db = getDb(env);

        let allowedStr = '[]';
        if (Array.isArray(body.allowedCollections)) {
            allowedStr = JSON.stringify(body.allowedCollections);
        } else if (typeof body.allowedCollections === 'string') {
            allowedStr = body.allowedCollections;
        }

        const updated = await db.update(taxonomies).set({
            label: body.label,
            slug: body.slug,
            description: body.description || '',
            allowedCollections: allowedStr,
            isRouted: body.isRouted === true || body.isRouted === 'true',
            prefixEntryUrl: body.prefixEntryUrl === true || body.prefixEntryUrl === 'true',
            allowIndexing: body.allowIndexing !== false && body.allowIndexing !== 'false',
        }).where(eq(taxonomies.id, id)).returning();

        if (updated.length === 0) {
            return new Response('Not found', { status: 404 });
        }

        return new Response(JSON.stringify(updated[0]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
    const user = locals.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const id = parseInt(params.id || '0', 10);
        if (!id) return new Response('Invalid ID', { status: 400 });

        const db = getDb(env);
        
        await db.delete(taxonomies).where(eq(taxonomies.id, id));

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
