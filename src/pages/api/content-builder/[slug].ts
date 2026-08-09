import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { collections } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

import { hasPermission } from '../../../lib/permissions';

export const PUT: APIRoute = async ({ request, params, locals }) => {
    const user = locals.user;
    const permissions = locals.permissions;
    if (!user || !permissions) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    const { slug } = params;
    
    try {
        const colRes = await db.select().from(collections).where(eq(collections.slug, slug as string)).limit(1);
        if (colRes.length === 0) return new Response('Not found', { status: 404 });
        
        const isOwner = colRes[0].authorId === user.userId;
        const canEdit = isOwner ? hasPermission(permissions, 'content_builder', 'edit_own') : hasPermission(permissions, 'content_builder', 'edit_others');
        if (!canEdit) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
        }
        const body = await request.json() as any;
        const updateData: any = {};
        
        if (body.fields) updateData.fields = body.fields;
        if (body.supports) {
            updateData.supports = body.supports;
            
            // Sync taxonomies.allowedCollections
            try {
                const supportsObj = JSON.parse(body.supports);
                const supportedTaxonomies = supportsObj.taxonomies || [];
                const { taxonomies } = await import('../../../db/schema');
                const allTaxes = await db.select().from(taxonomies);
                
                for (const tax of allTaxes) {
                    let allowed = [];
                    try { allowed = JSON.parse(tax.allowedCollections || '[]'); } catch(e) {}
                    
                    const isSupported = supportedTaxonomies.includes(tax.slug);
                    const isAllowed = allowed.includes(slug as string);
                    
                    if (isSupported && !isAllowed) {
                        allowed.push(slug as string);
                        await db.update(taxonomies).set({ allowedCollections: JSON.stringify(allowed) }).where(eq(taxonomies.id, tax.id));
                    } else if (!isSupported && isAllowed) {
                        allowed = allowed.filter((c: string) => c !== slug);
                        await db.update(taxonomies).set({ allowedCollections: JSON.stringify(allowed) }).where(eq(taxonomies.id, tax.id));
                    }
                }
            } catch(e) {
                console.error("Error syncing taxonomies:", e);
            }
        }
        if (body.label) updateData.label = body.label;
        if (body.description) updateData.description = body.description;

        await db.update(collections).set(updateData).where(eq(collections.slug, slug as string));
        
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
    const user = locals.user;
    const permissions = locals.permissions;
    if (!user || !permissions) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb(env);
    const { slug } = params;
    
    try {
        const colRes = await db.select().from(collections).where(eq(collections.slug, slug as string)).limit(1);
        if (colRes.length === 0) return new Response('Not found', { status: 404 });
        
        const isOwner = colRes[0].authorId === user.userId;
        const canDelete = isOwner ? hasPermission(permissions, 'content_builder', 'delete_own') : hasPermission(permissions, 'content_builder', 'delete_others');
        if (!canDelete) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
        }
        
        const url = new URL(request.url);
        const force = url.searchParams.get('force') === 'true';

        if (force) {
            // Delete all entries linked to this collection
            const { entries } = await import('../../../db/schema');
            await db.delete(entries).where(eq(entries.collectionId, colRes[0].id));
        }

        await db.delete(collections).where(eq(collections.slug, slug as string));
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
