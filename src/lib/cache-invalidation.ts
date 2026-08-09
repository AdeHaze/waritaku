import { getDb } from './db';
import { collections, taxonomies, terms } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { invalidateCachedPage } from './render-cache';
import { getCanonicalUrl } from './queries';

export async function invalidateEntryCache(env: any, collectionId: number, entryId: number, entrySlug: string, termIds: number[] = []) {
    if (!env?.RENDER_CACHE) return;

    try {
        const db = getDb(env);
        const pathsToInvalidate = new Set<string>();
        
        // Homepage and its pagination
        pathsToInvalidate.add('/');
        pathsToInvalidate.add('/beranda');
        for (let i = 2; i <= 5; i++) {
            pathsToInvalidate.add(`/page/${i}`);
            pathsToInvalidate.add(`/beranda/page/${i}`);
        }

        // Entry URL (canonical)
        const canonical = await getCanonicalUrl(db, entryId, entrySlug);
        pathsToInvalidate.add(`/${canonical}`);

        // Category/Term URLs
        if (termIds.length > 0) {
            const termsRes = await db.select({
                termSlug: terms.slug,
                taxSlug: taxonomies.slug,
                omitTax: taxonomies.omitTaxonomySlug
            })
            .from(terms)
            .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
            .where(inArray(terms.id, termIds));

            for (const t of termsRes) {
                const basePath = t.omitTax ? `/${t.termSlug}` : `/${t.taxSlug}/${t.termSlug}`;
                pathsToInvalidate.add(basePath);
                
                // Taxonomy pagination
                for (let i = 2; i <= 5; i++) {
                    pathsToInvalidate.add(`${basePath}/page/${i}`);
                }
            }
        }

        await invalidateCachedPage(env, Array.from(pathsToInvalidate));
    } catch (e) {
        console.error('[cache-invalidation] Error invalidating cache:', e);
    }
}
