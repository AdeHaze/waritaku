import type { APIRoute } from 'astro';
import { entries, collections, settings } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

import { getDb } from '../lib/db';

export const GET: APIRoute = async ({ request }) => {
    
    // Fallback if env is missing during build time
    if (!env || !env.DB) {
        return new Response('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>', { 
            headers: { 'Content-Type': 'application/xml; charset=utf-8' }
        });
    }

    const db = getDb(env);

    let siteUrl = new URL(request.url).origin;
    let sitemapCollections: string[] | null = null;
    let sitemapTaxonomies: string[] | null = null;
    
    const settingsRec = await db.select().from(settings).where(eq(settings.key, 'general_settings'));
    if (settingsRec.length > 0) {
        try {
            const parsed = JSON.parse(settingsRec[0].value);
            if (parsed.siteUrl) siteUrl = parsed.siteUrl;
            if (parsed.sitemapCollections !== undefined) sitemapCollections = parsed.sitemapCollections;
            if (parsed.sitemapTaxonomies !== undefined) sitemapTaxonomies = parsed.sitemapTaxonomies;
        } catch(e) {}
    }

    // 1. Count Total Published Entries
    const { sql } = await import('drizzle-orm');
    
    let countQuery = db.select({ count: sql<number>`count(*)` })
        .from(entries)
        .leftJoin(collections, eq(entries.collectionId, collections.id))
        .where(eq(entries.status, 'published'));
        
    if (sitemapCollections !== null) {
        if (sitemapCollections.length === 0) {
            countQuery = countQuery.where(sql`1=0`) as any; // Empty means no collections
        } else {
            countQuery = countQuery.where(and(eq(entries.status, 'published'), inArray(collections.slug, sitemapCollections))) as any;
        }
    }

    const countRes = await countQuery;
        
    const totalEntries = countRes[0]?.count || 0;
    const CHUNK_SIZE = 1000;
    const totalEntryPages = Math.max(1, Math.ceil(totalEntries / CHUNK_SIZE));

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // 1. Entries Sitemaps (Chunked by 1000)
    for (let p = 1; p <= totalEntryPages; p++) {
        if (totalEntries > 0) {
            xml += `  <sitemap>\n    <loc>${siteUrl}/sitemap-entries-${p}.xml</loc>\n  </sitemap>\n`;
        }
    }

    // 2. Terms Sitemap (Categories and Tags)
    if (sitemapTaxonomies === null || sitemapTaxonomies.length > 0) {
        xml += `  <sitemap>\n    <loc>${siteUrl}/sitemap-terms.xml</loc>\n  </sitemap>\n`;
    }

    xml += `</sitemapindex>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        },
    });
};
