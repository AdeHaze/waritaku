import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { collections } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const PUT: APIRoute = async ({ request, params, locals }) => {
    const user = locals.user;
    if (!user || user.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    const { slug } = params;
    
    try {
        const body = await request.json();
        const updateData: any = {};
        
        if (body.fields) updateData.fields = body.fields;
        if (body.supports) updateData.supports = body.supports;
        if (body.label) updateData.label = body.label;
        if (body.description) updateData.description = body.description;

        await db.update(collections).set(updateData).where(eq(collections.slug, slug as string));
        
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
    const user = locals.user;
    if (!user || user.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    const { slug } = params;
    
    try {
        const url = new URL(request.url);
        const force = url.searchParams.get('force') === 'true';

        if (force) {
            // Find collection id first
            const col = await db.select().from(collections).where(eq(collections.slug, slug as string)).get();
            if (col) {
                // Delete all entries linked to this collection
                const { entries } = await import('../../../db/schema');
                await db.delete(entries).where(eq(entries.collectionId, col.id));
            }
        }

        await db.delete(collections).where(eq(collections.slug, slug as string));
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
