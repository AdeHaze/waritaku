import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { syncCounts } from '../../../lib/sync-counts';

export const GET: APIRoute = async ({ request, locals }) => {
    // Only allow superadmin to run this script
    if (locals.user?.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: { 'Content-Type': 'application/json' }});
    }

    const env = locals.runtime?.env;
    if (!env || !env.DB) {
        return new Response(JSON.stringify({ error: 'Database not available' }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }

    try {
        const db = getDb(env);
        
        // This will block and wait for the counts to finish instead of using waitUntil,
        // because we want to return a success message when it's totally done.
        await syncCounts(db);

        return new Response(JSON.stringify({ 
            success: true, 
            message: 'All counts have been successfully recalculated and synchronized.' 
        }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
};
