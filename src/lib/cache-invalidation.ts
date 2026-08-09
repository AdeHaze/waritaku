import { getDb } from './db';
import { collections, taxonomies, terms } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { invalidateCachedPage } from './render-cache';
import { getCanonicalUrl } from './queries';

const PRODUCTION_ORIGIN = 'https://waritaku.com';
const BYPASS_HEADER = 'X-Render-Cache-Bypass';
const BYPASS_VALUE = '1';

/** Self-fetch a URL on the production origin to trigger SSR → R2 cache population. */
async function warmUrl(env: any, pathname: string, ctx?: any): Promise<void> {
    if (!env?.RENDER_CACHE) return;
    if (import.meta.env.DEV) return;
    const url = `${PRODUCTION_ORIGIN}${pathname}`;
    try {
        await fetch(url, {
            headers: {
                [BYPASS_HEADER]: BYPASS_VALUE,
                'Cache-Control': 'no-cache',
            },
        });
    } catch (e) {
        console.error('[cache-invalidation] Warm failed for:', pathname, e);
    }
}

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

        // Invalidate each path individually (invalidateCachedPage expects a single string)
        const paths = Array.from(pathsToInvalidate);
        for (const path of paths) {
            await invalidateCachedPage(env, path);
        }

        // Warm the entry URL into R2 — self-fetch triggers SSR and lazy cache population
        await warmUrl(env, `/${canonical}`);
        // Also warm the homepage (it changed — new article, sidebar refresh, etc.)
        await warmUrl(env, '/');
    } catch (e) {
        console.error('[cache-invalidation] Error:', e);
    }
}
