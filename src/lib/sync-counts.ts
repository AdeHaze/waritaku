import { eq, sql } from 'drizzle-orm';
import { collections, entries, entryTerms, terms } from '../db/schema';

/**
 * Synchronizes the entryCount columns for all collections and terms.
 * This should be called asynchronously (using ctx.waitUntil) whenever an entry is created, updated, or deleted.
 * 
 * @param db The Drizzle database instance
 */
export async function syncCounts(db: any) {
    try {
        // 1. Sync Collection Counts
        // Fetch all collections and count their published entries
        const collectionCounts = await db.select({
            collectionId: collections.id,
            count: sql<number>`count(${entries.id})`
        })
        .from(collections)
        .leftJoin(entries, sql`${entries.collectionId} = ${collections.id} AND ${entries.status} = 'published'`)
        .groupBy(collections.id);

        for (const row of collectionCounts) {
            await db.update(collections)
                .set({ entryCount: row.count })
                .where(eq(collections.id, row.collectionId));
        }

        // 2. Sync Term Counts
        // Fetch all terms and count their published entries via the entry_terms junction
        const termCounts = await db.select({
            termId: terms.id,
            count: sql<number>`count(${entries.id})`
        })
        .from(terms)
        .leftJoin(entryTerms, eq(terms.id, entryTerms.termId))
        .leftJoin(entries, sql`${entries.id} = ${entryTerms.entryId} AND ${entries.status} = 'published'`)
        .groupBy(terms.id);

        for (const row of termCounts) {
            await db.update(terms)
                .set({ entryCount: row.count })
                .where(eq(terms.id, row.termId));
        }

        console.log(`[Sync] Successfully synchronized counts for ${collectionCounts.length} collections and ${termCounts.length} terms.`);
    } catch (error) {
        console.error('[Sync] Failed to synchronize counts:', error);
    }
}
