import { eq, and, desc, sql, like } from 'drizzle-orm';
import { entries, collections, users, terms, taxonomies, entryTerms, settings } from '../db/schema';

export const getCanonicalUrl = async (db: any, entryId: number, entrySlug: string) => {
    const prefixRes = await db.select({ termSlug: terms.slug })
        .from(entryTerms)
        .innerJoin(terms, eq(entryTerms.termId, terms.id))
        .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
        .where(and(eq(entryTerms.entryId, entryId), eq(taxonomies.prefixEntryUrl, true)))
        .limit(1);
    
    if (prefixRes.length > 0) {
        return `${prefixRes[0].termSlug}/${entrySlug}`;
    }
    return entrySlug;
};

export async function resolveRouteData(db: any, slug: string, currentPage: number = 1, pageSize: number = 12) {
    if (!db || !slug) return null;

    // Helper to get collections
    const getCollection = async (cSlug: string) => {
        const res = await db.select().from(collections).where(eq(collections.slug, cSlug)).limit(1);
        return res.length > 0 ? res[0] : null;
    };

    const articlesCol = await getCollection('articles');
    const pagesCol = await getCollection('pages');

    // 0. Check Date Archive (e.g., 2025/03 or 2025/03/15)
    const dateMatch = slug.match(/^(\d{4})\/(\d{2})(?:\/(\d{2}))?$/);
    if (dateMatch && articlesCol) {
        const year = dateMatch[1];
        const month = dateMatch[2];
        const day = dateMatch[3]; // optional

        const monthNamesIndo = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];
        const monthIndex = parseInt(month, 10) - 1;
        const monthName = monthNamesIndo[monthIndex] || month;

        const archiveTitle = day 
            ? `Arsip: ${day} ${monthName} ${year}`
            : `Arsip: ${monthName} ${year}`;

        const datePrefix = day ? `${year}-${month}-${day}%` : `${year}-${month}-%`;

        // Count query
        const countResult = await db.select({ count: sql<number>`count(*)` })
            .from(entries)
            .where(
                and(
                    eq(entries.collectionId, articlesCol.id),
                    eq(entries.status, 'published'),
                    like(entries.publishedAt, datePrefix)
                )
            );

        const totalItems = countResult[0]?.count || 0;
        const totalPages = Math.ceil(totalItems / pageSize);

        // Fetch entries for date archive
        const entriesResult = await db.select({
            entry: entries,
            author: users
        })
        .from(entries)
        .leftJoin(users, eq(entries.authorId, users.id))
        .where(
            and(
                eq(entries.collectionId, articlesCol.id),
                eq(entries.status, 'published'),
                like(entries.publishedAt, datePrefix)
            )
        )
        .orderBy(desc(entries.publishedAt))
        .limit(pageSize)
        .offset((currentPage - 1) * pageSize);

        const categoryArticles = entriesResult.map((r: any) => {
            const data = JSON.parse(r.entry.data || '{}');
            const rawContent = data.content || '';
            const textOnly = rawContent.replace(/<[^>]+>/g, '').replace(/\[caption[^\]]*\]|\[\/caption\]/g, '').trim();
            const excerpt = textOnly.length > 120 ? textOnly.substring(0, 120) + '...' : textOnly;
            return {
                id: r.entry.id,
                slug: r.entry.slug,
                publishedAt: r.entry.publishedAt,
                ...data,
                authorName: r.author?.name || 'Writer',
                categoryName: 'Article', // Can be enriched with terms
                excerpt
            };
        });

        const data = {
            id: null,
            name: archiveTitle,
            slug,
            year,
            month,
            day,
            isDateArchive: true
        };

        return { pageType: 'category' as const, data, categoryArticles, totalPages, articleBottomHtml: '' };
    }

    const segments = slug.split('/');
    const lastSegment = segments[segments.length - 1];

    // 1. Try Entry by Slug (Article, Page, etc.)
    const entryResult = await db.select({
        entry: entries,
        collection: collections,
        author: users
    })
    .from(entries)
    .innerJoin(collections, eq(entries.collectionId, collections.id))
    .leftJoin(users, eq(entries.authorId, users.id))
    .where(
        and(
            eq(entries.slug, lastSegment),
            eq(entries.status, 'published')
        )
    )
    .limit(1);

    if (entryResult.length > 0) {
        const { entry, collection, author } = entryResult[0];

        // Strict URL Enforcement: If the entry has a prefix configured, ensure the user visited that exact prefix
        const canonicalUrl = await getCanonicalUrl(db, entry.id, entry.slug);
        if (slug !== canonicalUrl) {
            return { redirect: `/${canonicalUrl}` };
        }

        const parsedData = JSON.parse(entry.data || '{}');
        const genSlug = author?.name ? author.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : 'writer';
        
        let collectionSupports = {};
        try {
            collectionSupports = JSON.parse(collection.supports || '{}');
        } catch(e) {}

        const data: any = {
            id: entry.id,
            slug: entry.slug,
            canonicalUrl: `/${canonicalUrl}`,
            status: entry.status,
            publishedAt: entry.publishedAt,
            ...parsedData,
            authorName: author?.name || 'Writer',
            authorSlug: author?.slug || genSlug,
            tags: [],
            supports: collectionSupports
        };

        // If it's an article collection, fetch terms (categories/tags)
        if (collection.slug === 'articles') {
            const entryTermsResult = await db.select({
                term: terms,
                taxonomy: taxonomies
            })
            .from(entryTerms)
            .innerJoin(terms, eq(entryTerms.termId, terms.id))
            .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
            .where(eq(entryTerms.entryId, entry.id));

            // Map category name
            const cats = entryTermsResult.filter((t: any) => t.taxonomy.slug === 'categories');
            data.categoryName = cats.length > 0 ? cats[0].term.name : 'Article';
            data.categorySlug = cats.length > 0 ? cats[0].term.slug : 'all';

            // Map tags
            data.tags = entryTermsResult.filter((t: any) => t.taxonomy.slug === 'tags').map((t: any) => t.term);

            // Extract Article Custom HTML
            let articleBottomHtml = '';
            let articleUpperHtml = '';
            const genSettings = await db.select().from(settings).where(eq(settings.key, 'general_settings'));
            if (genSettings.length > 0) {
                try {
                    const parsed = JSON.parse(genSettings[0].value);
                    articleBottomHtml = parsed.articleBottomHtml || '';
                    articleUpperHtml = parsed.articleUpperHtml || '';
                } catch(e) {}
            }

            return { pageType: 'article' as const, data, categoryArticles: [], totalPages: 1, articleUpperHtml, articleBottomHtml };
        } 
        
        // If it's a page collection
        if (collection.slug === 'pages') {
            return { pageType: 'page' as const, data, categoryArticles: [], totalPages: 1, articleBottomHtml: '' };
        }

        // Generic collection fallback (for custom content types in the future)
        return { pageType: collection.slug as any, data, categoryArticles: [], totalPages: 1, articleBottomHtml: '' };
    }

    // 2. Try Term (Taxonomy Archive)
    let termResult: any[] = [];
    let taxonomyData: any = null;

    if (segments.length === 1 && segments[0] === 'all') {
        termResult = [{ term: { id: null, name: 'Semua Berita', slug: 'all' }, taxonomy: { allowIndexing: true } }];
    } else if (segments.length === 1) {
        // e.g. /category-term
        termResult = await db.select({
            term: terms,
            taxonomy: taxonomies
        })
        .from(terms)
        .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
        .where(
            and(
                eq(terms.slug, segments[0]),
                eq(taxonomies.isRouted, true)
            )
        )
        .limit(1);
    } else if (segments.length === 2) {
        // e.g. /product/dining-room
        termResult = await db.select({
            term: terms,
            taxonomy: taxonomies
        })
        .from(terms)
        .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
        .where(
            and(
                eq(taxonomies.slug, segments[0]),
                eq(terms.slug, segments[1]),
                eq(taxonomies.isRouted, true)
            )
        )
        .limit(1);
    }

    if (termResult.length > 0) {
        const data = termResult[0].term;
        taxonomyData = termResult[0].taxonomy;
        
        let countQuery = db.select({ count: sql<number>`count(distinct ${entries.id})` })
            .from(entries);

        if (data.id) {
            countQuery = countQuery
                .innerJoin(entryTerms, eq(entries.id, entryTerms.entryId))
                .where(
                    and(
                        eq(entryTerms.termId, data.id),
                        eq(entries.status, 'published')
                    )
                ) as any;
        } else {
            countQuery = countQuery.where(
                and(
                    eq(entries.collectionId, articlesCol?.id),
                    eq(entries.status, 'published')
                )
            ) as any;
        }
        
        const countResult = await countQuery;
        const totalItems = countResult[0]?.count || 0;
        const totalPages = Math.ceil(totalItems / pageSize);

        let articlesQuery = db.selectDistinct({
            entry: entries,
            author: users
        })
        .from(entries)
        .leftJoin(users, eq(entries.authorId, users.id));

        if (data.id) {
            articlesQuery = articlesQuery
                .innerJoin(entryTerms, eq(entries.id, entryTerms.entryId))
                .where(
                    and(
                        eq(entryTerms.termId, data.id),
                        eq(entries.status, 'published')
                    )
                ) as any;
        } else {
            articlesQuery = articlesQuery.where(
                and(
                    eq(entries.collectionId, articlesCol?.id),
                    eq(entries.status, 'published')
                )
            ) as any;
        }

        const articlesResult = await articlesQuery
            .orderBy(desc(entries.publishedAt))
            .limit(pageSize)
            .offset((currentPage - 1) * pageSize);

        const categoryArticles = [];
        for (const r of articlesResult) {
            const data = JSON.parse(r.entry.data || '{}');
            const rawContent = data.content || '';
            const textOnly = rawContent.replace(/<[^>]+>/g, '').replace(/\[caption[^\]]*\]|\[\/caption\]/g, '').trim();
            const excerpt = textOnly.length > 120 ? textOnly.substring(0, 120) + '...' : textOnly;
            
            const canonicalUrl = await getCanonicalUrl(db, r.entry.id, r.entry.slug);

            categoryArticles.push({
                id: r.entry.id,
                slug: r.entry.slug,
                canonicalUrl: `/${canonicalUrl}`,
                publishedAt: r.entry.publishedAt,
                ...data,
                authorName: r.author?.name || 'Writer',
                categoryName: taxonomyData?.label || 'Term',
                excerpt
            });
        }

        // Extend data with taxonomy context for SEO/indexing
        const archiveData = {
            ...data,
            taxonomy: taxonomyData
        };

        return { pageType: 'category' as const, data: archiveData, categoryArticles, totalPages, articleBottomHtml: '' };
    }

    return null;
}
