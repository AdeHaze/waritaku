import { eq, ne, and } from 'drizzle-orm';
import { terms, entries, taxonomies } from '../db/schema';

/**
 * Generates a universally unique slug across both Terms and Entries, respecting routing collision rules.
 * 
 * @param db The Drizzle database instance
 * @param baseSlug The desired starting slug (e.g., 'article')
 * @param entityType 'entry' or 'term'
 * @param ignoreId (Optional) ID to ignore (used during updates)
 * @param omitTaxonomySlugContext (Optional) For terms, pass true if the term's taxonomy omits its slug
 * @returns A guaranteed unique slug (e.g., 'article', 'article-2', 'article-3')
 */
export async function generateUniqueSlug(
    db: any,
    baseSlug: string,
    entityType: 'entry' | 'term',
    ignoreId?: number,
    omitTaxonomySlugContext?: boolean
): Promise<string> {
    // Sanitize base slug
    let sanitized = baseSlug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!sanitized) {
        sanitized = 'untitled';
    }

    let currentSlug = sanitized;
    let counter = 2; // Start appending at -2

    while (true) {
        if (entityType === 'term') {
            let termConditions: any = eq(terms.slug, currentSlug);
            if (ignoreId) {
                termConditions = and(termConditions, ne(terms.id, ignoreId));
            }
            const termExists = await db.select({ id: terms.id }).from(terms).where(termConditions).limit(1);
            
            let entryConflict = false;
            if (omitTaxonomySlugContext) {
                const entryExists = await db.select({ id: entries.id }).from(entries).where(eq(entries.slug, currentSlug)).limit(1);
                entryConflict = entryExists.length > 0;
            }
            
            if (termExists.length === 0 && !entryConflict) return currentSlug;
        } else {
            let entryConditions: any = eq(entries.slug, currentSlug);
            if (ignoreId) {
                entryConditions = and(entryConditions, ne(entries.id, ignoreId));
            }
            const entryExists = await db.select({ id: entries.id }).from(entries).where(entryConditions).limit(1);
            
            // For entries, we must avoid slugs that are taken by a term whose taxonomy omits its slug
            const conflictingTerm = await db.select({ id: terms.id })
                .from(terms)
                .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
                .where(and(eq(terms.slug, currentSlug), eq(taxonomies.omitTaxonomySlug, true)))
                .limit(1);

            if (entryExists.length === 0 && conflictingTerm.length === 0) return currentSlug;
        }

        // Otherwise, increment and try again
        currentSlug = `${sanitized}-${counter}`;
        counter++;
    }
}
