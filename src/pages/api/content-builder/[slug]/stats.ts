import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { collections, entries } from '../../../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params, locals }) => {
    const user = locals.user;
    if (!user || user.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    const { slug } = params;
    
    try {
        const collection = await db.select().from(collections).where(eq(collections.slug, slug as string)).get();
        if (!collection) {
             return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
        }

        const stats = await db.select({
            count: sql<number>`count(*)`
        }).from(entries).where(eq(entries.collectionId, collection.id)).get();

        return new Response(JSON.stringify({ count: stats?.count || 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
