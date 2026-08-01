import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { collections } from '../../../db/schema';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ request, locals }) => {
    const user = locals.user;
    if (!user || user.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    
    try {
        const list = await db.select().from(collections);
        return new Response(JSON.stringify(list), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user;
    if (!user || user.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    
    try {
        const body = await request.json();
        
        if (!body.slug || !body.label || !body.labelSingular) {
             return new Response(JSON.stringify({ error: 'Missing required fields: slug, label, labelSingular' }), { status: 400 });
        }

        const inserted = await db.insert(collections).values({
            slug: body.slug,
            label: body.label,
            labelSingular: body.labelSingular,
            description: body.description || '',
            icon: body.icon || 'FileText',
            routePrefix: body.routePrefix || '/',
            fields: body.fields || '[]',
            supports: body.supports || '{}'
        }).returning({ id: collections.id, slug: collections.slug });
        
        return new Response(JSON.stringify(inserted[0]), { status: 201, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        if (e.message.includes('UNIQUE constraint failed')) {
            return new Response(JSON.stringify({ error: 'A content type with this slug already exists.' }), { status: 400 });
        }
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
