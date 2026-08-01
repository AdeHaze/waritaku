import type { APIRoute } from 'astro';
import { articles, pages, categories, tags } from '../db/schema';
import { eq } from 'drizzle-orm';
import { env } from "cloudflare:workers";
import { getDb } from '../lib/db';


export const GET: APIRoute = async ({ request }) => {
    const siteUrl = new URL(request.url).origin;
    
    if (!env || !env.DB) {
        return new Response('Database environment not found', { status: 500 });
    }

    const db = getDb(env);

    const [publishedArticles, publishedPages, allCategories, allTags] = await Promise.all([
        db.select({ slug: articles.slug, updatedAt: articles.updatedAt, publishedAt: articles.publishedAt }).from(articles).where(eq(articles.status, 'published')),
        db.select({ slug: pages.slug, publishedAt: pages.publishedAt }).from(pages).where(eq(pages.status, 'published')),
        db.select({ slug: categories.slug }).from(categories),
        db.select({ slug: tags.slug }).from(tags),
    ]);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // 1. Homepage
    xml += `  <url>\n    <loc>${siteUrl}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    // 2. Articles
    publishedArticles.forEach(article => {
        xml += `  <url>\n`;
        xml += `    <loc>${siteUrl}/${article.slug}</loc>\n`;
        const date = article.updatedAt || article.publishedAt;
        if (date) {
            xml += `    <lastmod>${date.split('T')[0]}</lastmod>\n`;
        }
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.8</priority>\n`;
        xml += `  </url>\n`;
    });

    // 3. Pages
    publishedPages.forEach(page => {
        xml += `  <url>\n`;
        xml += `    <loc>${siteUrl}/${page.slug}</loc>\n`;
        if (page.publishedAt) {
            xml += `    <lastmod>${page.publishedAt.split('T')[0]}</lastmod>\n`;
        }
        xml += `    <changefreq>monthly</changefreq>\n`;
        xml += `    <priority>0.6</priority>\n`;
        xml += `  </url>\n`;
    });

    // 4. Categories
    allCategories.forEach(category => {
        xml += `  <url>\n`;
        xml += `    <loc>${siteUrl}/${category.slug}</loc>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.5</priority>\n`;
        xml += `  </url>\n`;
    });

    // 5. Tags
    allTags.forEach(tag => {
        xml += `  <url>\n`;
        xml += `    <loc>${siteUrl}/tag/${tag.slug}</loc>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.4</priority>\n`;
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
