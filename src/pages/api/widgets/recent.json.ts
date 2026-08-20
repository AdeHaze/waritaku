import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { entries, collections, taxonomies, terms, entryTerms } from '../../../db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getCanonicalUrls } from '../../../lib/queries';

export const GET: APIRoute = async ({ request }) => {
    const db = getDb(env as any);
    const url = new URL(request.url);
    
    // Parse query params
    const taxSlug = url.searchParams.get('tax') || 'all';
    const termsParam = url.searchParams.get('terms') || 'all';
    const limitParam = parseInt(url.searchParams.get('limit') || '50');
    const limit = Math.min(100, Math.max(1, limitParam)); // Cap at 100 max for the pool
    
    try {
        const articlesCol = await db.select().from(collections).where(eq(collections.slug, 'articles')).limit(1);
        if (articlesCol.length === 0) {
            return new Response(JSON.stringify({ error: 'Articles collection not found' }), { status: 404 });
        }

        let query: any = db.select({ entry: entries }).from(entries);
        let conditions: any = and(eq(entries.status, 'published'), eq(entries.collectionId, articlesCol[0].id));

        // Apply Taxonomy Filter if specific terms are selected
        if (taxSlug !== 'all' && termsParam !== 'all') {
            const termIds = termsParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            if (termIds.length > 0) {
                // Use a subquery-like approach or distinct innerJoin. We'll use innerJoin and groupBy only when filtering.
                query = query.innerJoin(entryTerms, eq(entries.id, entryTerms.entryId));
                conditions = and(conditions, inArray(entryTerms.termId, termIds));
                query = query.where(conditions).groupBy(entries.id);
            } else {
                query = query.where(conditions);
            }
        } else {
            query = query.where(conditions);
        }

        // Order by primary key (id) descending for massive performance gains instead of publishedAt
        const result = await query.orderBy(desc(entries.id)).limit(limit);

        // Batch-fetch the primary category term for all results (to show on the card badge)
        const entryIds = result.map((r: any) => r.entry.id);
        let categoryMap: Record<number, any[]> = {};
        
        if (entryIds.length > 0) {
            const catTax = await db.select({ id: taxonomies.id })
                .from(taxonomies).where(eq(taxonomies.slug, 'categories')).limit(1);
                
            if (catTax.length > 0) {
                const catTermRows = await db.select({ entryId: entryTerms.entryId, id: terms.id, name: terms.name })
                    .from(entryTerms)
                    .innerJoin(terms, eq(entryTerms.termId, terms.id))
                    .where(and(
                        eq(terms.taxonomyId, catTax[0].id),
                        inArray(entryTerms.entryId, entryIds)
                    ));
                for (const row of catTermRows) {
                    if (!categoryMap[row.entryId]) categoryMap[row.entryId] = [];
                    categoryMap[row.entryId].push(row);
                }
            }
        }

        // Batch-fetch canonical URLs
        const canonicalUrlMap = await getCanonicalUrls(db, entryIds);

        // Format the output specifically for the client-side widget
        const formattedArticles = await Promise.all(result.map(async (r: any) => {
            const data = JSON.parse(r.entry.data || '{}');
            const rawContent = data.content || '';
            const textOnly = rawContent.replace(/<[^>]+>/g, '').replace(/\[caption[^\]]*\]|\[\/caption\]/g, '').trim();
            const excerpt = textOnly.length > 80 ? textOnly.substring(0, 80) + '...' : textOnly;
            
            const prefixSlug = canonicalUrlMap[r.entry.id];
            const canonicalUrl = prefixSlug ? `${prefixSlug}/${r.entry.slug}` : r.entry.slug;
            
            let categoryName = '';
            const cats = categoryMap[r.entry.id] || [];
            if (cats.length > 0) {
                const primary = data.primaryTermId ? cats.find((c: any) => c.id === data.primaryTermId) : null;
                categoryName = primary ? primary.name : cats[0].name;
            }

            return { 
                id: r.entry.id, 
                slug: r.entry.slug, 
                canonicalUrl: `/${canonicalUrl}`, 
                publishedAt: r.entry.publishedAt, 
                title: data.title,
                featuredImageUrl: data.featuredImageUrl,
                content: rawContent, // For thumbnail extraction if featuredImageUrl is missing
                categoryName, 
                excerpt 
            };
        }));

        // Aggressively cache at the edge for 1 hour (3600 seconds)
        // Allow serving stale content for up to 1 day while revalidating in background
        return new Response(JSON.stringify(formattedArticles), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
            }
        });

    } catch (e: any) {
        console.error("Error generating recent.json cache:", e);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
