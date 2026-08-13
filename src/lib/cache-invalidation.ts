import { getDb } from './db';
import { settings, entries, taxonomies, terms } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { invalidateCachedPage } from './render-cache';
import { getCanonicalUrl } from './queries';

/**
 * Look up the slug of the page currently set as the static homepage.
 * Returns null if no homepage is configured or the DB is unavailable.
 */
async function getHomepageSlug(db: any): Promise<string | null> {
    try {
        const row = await db.select({ value: settings.value })
            .from(settings)
            .where(eq(settings.key, 'homepage_page_id'))
            .get();
        if (!row?.value) return null;

        const pageId = parseInt(row.value, 10);
        if (isNaN(pageId)) return null;

        const entry = await db.select({ slug: entries.slug })
            .from(entries)
            .where(eq(entries.id, pageId))
            .get();
        return entry?.slug ?? null;
    } catch {
        return null;
    }
}

/**
 * Purge the homepage cache: / and the actual page slug (e.g. /beranda,
 * /berandawinter — whatever is currently set as the homepage).
 * Call this whenever the frontpage selection, sidebar config, or theme changes.
 */
export async function invalidateHomepageCache(env: any): Promise<void> {
    if (!env?.RENDER_CACHE) return;
    if (import.meta.env.DEV) return;

    const db = getDb(env);
    const paths: string[] = ['/'];

    const slug = await getHomepageSlug(db);
    if (slug) paths.push(`/${slug}`);

    try {
        await invalidateCachedPage(env, paths);
    } catch (e) {
        console.error('[cache-invalidation] invalidateHomepageCache error:', e);
    }
}

/**
 * Purge all R2/CF-edge cached pages affected by an entry being
 * published, updated, or deleted.
 *
 * NOTE: warmUrl (self-fetch) has been intentionally removed.
 * Re-populating R2 via a self-fetch races against Cloudflare edge-purge
 * propagation: the warm request may hit an edge node that still holds the
 * stale response, so the Worker never runs and R2 never gets the fresh
 * version. The middleware already handles lazy R2 population on the next
 * real organic request — this is sufficient and avoids the race condition.
 */
export async function invalidateEntryCache(env: any, collectionId: number, entryId: number, entrySlug: string, termIds: number[] = []) {
    if (!env?.RENDER_CACHE) return;

    try {
        const db = getDb(env);
        const pathsToInvalidate = new Set<string>();

        // Always purge the root homepage
        pathsToInvalidate.add('/');

        // Dynamically purge the actual homepage page slug (e.g. /beranda,
        // /berandawinter) so it doesn't stay stale after the slug changes.
        const homepageSlug = await getHomepageSlug(db);
        if (homepageSlug) pathsToInvalidate.add(`/${homepageSlug}`);

        // Entry canonical URL
        const canonical = await getCanonicalUrl(db, entryId, entrySlug);
        pathsToInvalidate.add(`/${canonical}`);

        // Category/Term archive URLs + their paginations
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
                for (let i = 2; i <= 5; i++) {
                    pathsToInvalidate.add(`${basePath}/page/${i}`);
                }
            }
        }

        const paths = Array.from(pathsToInvalidate);
        await invalidateCachedPage(env, paths);
    } catch (e) {
        console.error('[cache-invalidation] Error:', e);
    }
}
