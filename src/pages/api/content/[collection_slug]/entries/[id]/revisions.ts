import type { APIRoute } from 'astro';
import { getDb } from '../../../../../../lib/db';
import { entries, entryRevisions, users } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const db = getDb(env);
    const entryId = parseInt(params.id as string, 10);

    try {
        const revisions = await db.select({
            revision: entryRevisions,
            author: users
        })
            .from(entryRevisions)
            .leftJoin(users, eq(entryRevisions.authorId, users.id))
            .where(eq(entryRevisions.entryId, entryId))
            .orderBy(desc(entryRevisions.createdAt))
            .limit(50);

        return new Response(JSON.stringify({ data: revisions }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Failed to load revisions' }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const db = getDb(env);
    const entryId = parseInt(params.id as string, 10);

    try {
        const body = await request.json() as any;
        const revisionId = body.revisionId;
        if (!revisionId) {
            return new Response(JSON.stringify({ error: 'revisionId is required' }), { status: 400 });
        }

        await db.delete(entryRevisions).where(eq(entryRevisions.id, revisionId));
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Failed to delete revision' }), { status: 500 });
    }
};
