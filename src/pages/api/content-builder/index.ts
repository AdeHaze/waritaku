import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { collections } from '../../../db/schema';
import { env } from 'cloudflare:workers';
import { hasPermission } from '../../../lib/permissions';

export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user;
    const permissions = locals.permissions;
    if (!user || !permissions || !hasPermission(permissions, 'content_builder', 'read')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    
    try {
        const list = await db.select().from(collections);
        return new Response(JSON.stringify(list), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user;
    const permissions = locals.permissions;
    if (!user || !permissions || !hasPermission(permissions, 'content_builder', 'create')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    
    try {
        const body = await request.json() as any;
        
        if (!body.slug || !body.label || !body.labelSingular) {
             return new Response(JSON.stringify({ error: 'Missing required fields: slug, label, labelSingular' }), { status: 400 });
        }

        const inserted = await db.insert(collections).values({
            authorId: user.userId,
            slug: body.slug,
            label: body.label,
            labelSingular: body.labelSingular,
            description: body.description || '',
            icon: body.icon || 'FileText',
            routePrefix: body.routePrefix || '/',
            fields: body.fields || '[]',
            supports: body.supports || '{}'
        }).returning({ id: collections.id, slug: collections.slug });
        
        // Sync taxonomies.allowedCollections
        if (body.supports) {
            try {
                const supportsObj = JSON.parse(body.supports);
                const supportedTaxonomies = supportsObj.taxonomies || [];
                if (supportedTaxonomies.length > 0) {
                    const { taxonomies } = await import('../../../db/schema');
                    const { eq } = await import('drizzle-orm');
                    const allTaxes = await db.select().from(taxonomies);
                    
                    for (const tax of allTaxes) {
                        if (supportedTaxonomies.includes(tax.slug)) {
                            let allowed = [];
                            try { allowed = JSON.parse(tax.allowedCollections || '[]'); } catch(e) {}
                            if (!allowed.includes(body.slug)) {
                                allowed.push(body.slug);
                                await db.update(taxonomies).set({ allowedCollections: JSON.stringify(allowed) }).where(eq(taxonomies.id, tax.id));
                            }
                        }
                    }
                }
            } catch(e) {
                console.error("Error syncing taxonomies on create:", e);
            }
        }
        
        return new Response(JSON.stringify(inserted[0]), { status: 201, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        if (e.message.includes('UNIQUE constraint failed')) {
            return new Response(JSON.stringify({ error: 'A content type with this slug already exists.' }), { status: 400 });
        }
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
