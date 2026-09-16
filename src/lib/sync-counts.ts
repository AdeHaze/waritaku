import { eq, sql } from 'drizzle-orm';
import { collections, entries, entryTerms, terms } from '../db/schema';

/**
 * Synchronizes the entry_count columns for all collections and terms.
 * This should be called asynchronously (using ctx.waitUntil) whenever an entry is created, updated, or deleted.
 * 
 * @param db The Drizzle database instance
 */
export async function syncCounts(db: any, collectionId?: number, termIds?: number[]) {
    try {
        // 1. Sync Collection Counts
        if (collectionId !== undefined) {
            await db.run(sql`
                UPDATE collections 
                SET entry_count = (
                    SELECT count(id) 
                    FROM entries 
                    WHERE entries.collection_id = collections.id AND entries.status = 'published'
                )
                WHERE id = ${collectionId}
            `);
        } else {
            await db.run(sql`
                UPDATE collections 
                SET entry_count = (
                    SELECT count(id) 
                    FROM entries 
                    WHERE entries.collection_id = collections.id AND entries.status = 'published'
                )
            `);
        }

        // 2. Sync Term Counts
        if (termIds && termIds.length > 0) {
            // Join the array into a comma-separated string for the IN clause
            const termsList = sql.raw(termIds.join(','));
            await db.run(sql`
                UPDATE terms 
                SET entry_count = (
                    SELECT count(entries.id) 
                    FROM entry_terms 
                    JOIN entries ON entries.id = entry_terms.entry_id 
                    WHERE entry_terms.term_id = terms.id AND entries.status = 'published'
                )
                WHERE id IN (${termsList})
            `);
        } else if (!termIds) {
            // If undefined (not an empty array), do full sync
            await db.run(sql`
                UPDATE terms 
                SET entry_count = (
                    SELECT count(entries.id) 
                    FROM entry_terms 
                    JOIN entries ON entries.id = entry_terms.entry_id 
                    WHERE entry_terms.term_id = terms.id AND entries.status = 'published'
                )
            `);
        }

        console.log(`[Sync] Successfully synchronized counts for collections and terms.`);
    } catch (error) {
        console.error('[Sync] Failed to synchronize counts:', error);
    }
}
