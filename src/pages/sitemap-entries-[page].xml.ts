import type { APIRoute } from 'astro';
import { entries, settings } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '../lib/db';
import { getCanonicalUrls } from '../lib/queries';

export const GET: APIRoute = async ({ params, request }) => {
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

    const page = parseInt(params.page || '1', 10);
    const CHUNK_SIZE = 1000;
    
    // Fetch chunk of published entries
    const pageEntries = await db.select({ 
        id: entries.id, 
        slug: entries.slug, 
        updatedAt: entries.updatedAt, 
        publishedAt: entries.publishedAt 
    })
    .from(entries)
    .where(eq(entries.status, 'published'))
    .orderBy(desc(entries.id))
    .limit(CHUNK_SIZE)
    .offset((page - 1) * CHUNK_SIZE);

    if (pageEntries.length === 0) {
        return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { 
            headers: { 'Content-Type': 'application/xml; charset=utf-8' }
        });
    }

    const entryIds = pageEntries.map(e => e.id);
    let canonicalMap: Record<number, string> = {};
    
    // Chunk the canonical URL lookup to respect SQLite param binding limits (chunk by 50 to be safe)
    for (let i = 0; i < entryIds.length; i += 50) {
        const chunk = entryIds.slice(i, i + 50);
        if (chunk.length > 0) {
            const part = await getCanonicalUrls(db, chunk);
            canonicalMap = { ...canonicalMap, ...part };
        }
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    for (const entry of pageEntries) {
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

    xml += `</urlset>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        },
    });
};
