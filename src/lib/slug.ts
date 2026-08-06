import { eq, ne, and } from 'drizzle-orm';
import { terms, entries } from '../db/schema';

/**
 * Generates a universally unique slug across both Terms and Entries.
 * 
 * @param db The Drizzle database instance
 * @param baseSlug The desired starting slug (e.g., 'article')
 * @param ignoreTermId (Optional) Term ID to ignore (used during updates)
 * @param ignoreEntryId (Optional) Entry ID to ignore (used during updates)
 * @returns A guaranteed unique slug (e.g., 'article', 'article-2', 'article-3')
 */
export async function generateUniqueSlug(
    db: any,
    baseSlug: string,
    ignoreTermId?: number,
    ignoreEntryId?: number
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
        // 1. Check Terms
        let termConditions: any = eq(terms.slug, currentSlug);
        if (ignoreTermId) {
            termConditions = and(termConditions, ne(terms.id, ignoreTermId));
        }
        const termExists = await db.select({ id: terms.id }).from(terms).where(termConditions).limit(1);

        // 2. Check Entries
        let entryConditions: any = eq(entries.slug, currentSlug);
        if (ignoreEntryId) {
            entryConditions = and(entryConditions, ne(entries.id, ignoreEntryId));
        }
        const entryExists = await db.select({ id: entries.id }).from(entries).where(entryConditions).limit(1);

        // If it's free in both, we found our slug!
        if (termExists.length === 0 && entryExists.length === 0) {
            return currentSlug;
        }

        // Otherwise, increment and try again
        currentSlug = `${sanitized}-${counter}`;
        counter++;
    }
}
