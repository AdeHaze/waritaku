import type { APIRoute } from 'astro';
import { entries, collections, terms, taxonomies, settings } from '../db/schema';
import { eq, and } from 'drizzle-orm';

import { getDb } from '../lib/db';
import { getCanonicalUrls } from '../lib/queries';

export const GET: APIRoute = async ({ request }) => {
    
    // Fallback if env is missing during build time
    if (!env || !env.DB) {
        return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { 
            headers: { 'Content-Type': 'application/xml; charset=utf-8' }
        });
    }

    const db = getDb(env);

    let siteUrl = new URL(request.url).origin;
    const settingsRec = await db.select().from(settings).where(eq(settings.key, 'general_settings'));
    if (settingsRec.length > 0) {
        try {
            const parsed = JSON.parse(settingsRec[0].value);
            if (parsed.siteUrl) siteUrl = parsed.siteUrl;
        } catch(e) {}
    }

    const [publishedEntries, allTerms] = await Promise.all([
        db.select({ 
            id: entries.id, 
            slug: entries.slug, 
            updatedAt: entries.updatedAt, 
            publishedAt: entries.publishedAt 
        }).from(entries).where(eq(entries.status, 'published')),
        
        db.select({ slug: terms.slug }).from(terms),
    ]);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // 1. Homepage
    xml += `  <url>\n    <loc>${siteUrl}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    // 2. Entries (Articles, Pages, etc) — batch-fetch canonical URLs
    const entryIds = publishedEntries.map((e: any) => e.id);
    const canonicalMap = await getCanonicalUrls(db, entryIds);

    for (const entry of publishedEntries) {
        xml += `  <url>\n`;
        const prefix = canonicalMap[entry.id];
        const urlPath = prefix ? `${prefix}/${entry.slug}` : entry.slug;
        xml += `    <loc>${siteUrl}/${urlPath}</loc>\n`;
        const date = entry.updatedAt || entry.publishedAt;
        if (date) {
            xml += `    <lastmod>${date.split('T')[0]}</lastmod>\n`;
        }
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.8</priority>\n`;
        xml += `  </url>\n`;
    }

    // 3. Terms (Categories, Tags)
    allTerms.forEach(term => {
        xml += `  <url>\n`;
        xml += `    <loc>${siteUrl}/${term.slug}</loc>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.5</priority>\n`;
        xml += `  </url>\n`;
    });

    xml += `</urlset>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        },
    });
};
