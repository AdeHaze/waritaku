import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { taxonomies, terms, entryTerms } from '../../../../db/schema';
import { eq, sql } from 'drizzle-orm';

export const GET: APIRoute = async ({ params, locals, env }) => {
    const user = locals.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { id } = params;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

    try {
        const db = getDb(env);

        // Check if taxonomy exists
        const tax = await db.select().from(taxonomies).where(eq(taxonomies.id, parseInt(id))).limit(1);
        if (tax.length === 0) {
            return new Response(JSON.stringify({ error: 'Taxonomy not found' }), { status: 404 });
        }

        // Count Terms
        const termsCountResult = await db.select({ count: sql<number>`count(*)` })
            .from(terms)
            .where(eq(terms.taxonomyId, parseInt(id)));
        const termCount = termsCountResult[0]?.count || 0;

        // Count Entries linked to this taxonomy
        // Using a subquery/join to find all entry_terms that link to terms in this taxonomy
        const entriesCountResult = await db.select({ count: sql<number>`count(distinct ${entryTerms.entryId})` })
            .from(entryTerms)
            .innerJoin(terms, eq(entryTerms.termId, terms.id))
            .where(eq(terms.taxonomyId, parseInt(id)));
        const entryCount = entriesCountResult[0]?.count || 0;

        return new Response(JSON.stringify({ termCount, entryCount }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
