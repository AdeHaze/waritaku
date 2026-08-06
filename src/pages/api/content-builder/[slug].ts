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
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
