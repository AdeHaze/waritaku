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
        const allowIndexing = body.allowIndexing !== false && body.allowIndexing !== 'false';
        const omitTaxonomySlug = body.omitTaxonomySlug === true || body.omitTaxonomySlug === 'true';

        if (prefixEntryUrl) {
            isRouted = true;
        }
        if (omitTaxonomySlug && !isRouted) {
            return new Response(JSON.stringify({ error: 'Cannot omit taxonomy slug if archive pages are disabled' }), { status: 400 });
        }

        const updated = await db.update(taxonomies).set({
            label: body.label,
            slug: body.slug,
            description: body.description || '',
            allowedCollections: allowedStr,
            isRouted: isRouted,
            prefixEntryUrl: prefixEntryUrl,
            allowIndexing: allowIndexing,
            omitTaxonomySlug: omitTaxonomySlug,
        }).where(eq(taxonomies.id, id)).returning();

        // Sync collections.supports.taxonomies
        try {
            const allowed = JSON.parse(allowedStr || '[]');
            const { collections } = await import('../../../db/schema');
            const allCollections = await db.select().from(collections);
            
            for (const col of allCollections) {
                let supportsObj: any = {};
                try { supportsObj = JSON.parse(col.supports || '{}'); } catch(e) {}
                let supportedTaxonomies = supportsObj.taxonomies || [];
                
                const isAllowed = allowed.includes(col.slug);
                const isSupported = supportedTaxonomies.includes(body.slug);
                
                let modified = false;
                if (isAllowed && !isSupported) {
                    supportedTaxonomies.push(body.slug);
                    modified = true;
                } else if (!isAllowed && isSupported) {
                    supportedTaxonomies = supportedTaxonomies.filter((t: string) => t !== body.slug);
                    modified = true;
                }
                
                if (modified) {
                    supportsObj.taxonomies = supportedTaxonomies;
                    await db.update(collections).set({ supports: JSON.stringify(supportsObj) }).where(eq(collections.id, col.id));
                }
            }
        } catch(e) {
            console.error("Error reverse syncing collections:", e);
        }

        if (updated.length === 0) {
            return new Response('Not found', { status: 404 });
        }

        return new Response(JSON.stringify(updated[0]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
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
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
