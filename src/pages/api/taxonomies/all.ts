import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { taxonomies, terms } from '../../../db/schema';
import { env } from 'cloudflare:workers';

import { hasPermission } from '../../../lib/permissions';

export const GET: APIRoute = async ({ locals }) => {
    // We allow fetching all taxonomies/terms for Block Builder UI.
    // It's used by authors/editors dynamically.
    const user = locals.user;
    const permissions = locals.permissions;
    if (!user || !permissions || !hasPermission(permissions, 'taxonomies', 'read')) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const db = getDb(env);
        
        // Fetch all taxonomies
        const allTaxonomies = await db.select().from(taxonomies);
        
        // Fetch all terms
        const allTerms = await db.select().from(terms);
        
        return new Response(JSON.stringify({
            taxonomies: allTaxonomies,
            terms: allTerms
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
    }
};
