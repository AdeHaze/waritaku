import type { APIRoute } from 'astro';
import { entries, collections, settings } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '../lib/db';
import { getCanonicalUrls } from '../lib/queries';

export const GET: APIRoute = async ({ request }) => {
    if (!env || !env.DB) {
        return new Response('', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    const db = getDb(env);

    let siteUrl = new URL(request.url).origin;
    let siteTitle = 'Waritaku';
    let siteDescription = '';
    let siteTagline = '';
    const settingsRec = await db.select().from(settings).where(eq(settings.key, 'general_settings'));
    if (settingsRec.length > 0) {
        try {
            const parsed = JSON.parse(settingsRec[0].value);
            if (parsed.siteUrl) siteUrl = parsed.siteUrl;
            if (parsed.siteTitle) siteTitle = parsed.siteTitle;
            if (parsed.siteDescription) siteDescription = parsed.siteDescription;
            if (parsed.tagline) siteTagline = parsed.tagline;
        } catch(e) {}
    }

    const articlesCol = await db.select().from(collections).where(eq(collections.slug, 'articles')).limit(1);
    let articles: any[] = [];
    if (articlesCol.length > 0) {
        articles = await db.select({
            id: entries.id,
            slug: entries.slug,
            publishedAt: entries.publishedAt,
        }).from(entries)
          .where(eq(entries.collectionId, articlesCol[0].id))
          .orderBy(desc(entries.id))
          .limit(50);
    }

    // Canonical URLs for recent articles (chunked — D1 caps bind params at ~100)
    const ids = articles.map(a => a.id);
    let canonicalMap: Record<number, string> = {};
    for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const part = chunk.length > 0 ? await getCanonicalUrls(db, chunk) : {};
        canonicalMap = { ...canonicalMap, ...part };
    }
    const articleLinks = articles.map(a => {
        const prefix = canonicalMap[a.id];
        return `- [${a.slug.replace(/-/g, ' ')}](${siteUrl}/${prefix ? `${prefix}/` : ''}${a.slug})`;
    }).join('\n');

    const text = `# ${siteTitle}

> ${siteDescription || siteTagline || siteTitle} — news and articles.

## Navigation

- [Home](${siteUrl}/)
- [Sitemap](${siteUrl}/sitemap.xml)

## Recent Articles

${articleLinks || '- No articles yet.'}

## About

This is ${siteTitle}. Content is published in Indonesian (and occasionally English).
`;

    return new Response(text, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
    });
};
