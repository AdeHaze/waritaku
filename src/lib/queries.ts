import { eq, and, sql, desc, inArray, gte, lte, ne } from 'drizzle-orm';
import { entries, collections, users, terms, taxonomies, entryTerms, settings } from '../db/schema';

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
    if (!json) return fallback;
    try { return JSON.parse(json); } catch { return fallback; }
}

// Batched version of getCanonicalUrl — single query for all entry IDs
export async function getCanonicalUrls(db: any, entryIds: number[]): Promise<Record<number, string>> {
    if (!entryIds.length) return {};
    const results = await db.select({
        entryId: entryTerms.entryId,
        termId: terms.id,
        termSlug: terms.slug,
        taxonomySlug: taxonomies.slug,
        entryUrlFormat: taxonomies.entryUrlFormat,
        supports: collections.supports,
        entryData: entries.data
    })
    .from(entryTerms)
    .innerJoin(terms, eq(entryTerms.termId, terms.id))
    .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
    .innerJoin(entries, eq(entries.id, entryTerms.entryId))
    .innerJoin(collections, eq(entries.collectionId, collections.id))
    .where(and(
        inArray(entryTerms.entryId, entryIds),
        ne(taxonomies.entryUrlFormat, 'none')
    ));
    
    // Group by entryId
    const byEntry: Record<number, any[]> = {};
    for (const r of results) {
        if (!byEntry[r.entryId]) byEntry[r.entryId] = [];
        byEntry[r.entryId].push(r);
    }

    const map: Record<number, string> = {};
    for (const entryIdStr of Object.keys(byEntry)) {
        const entryId = parseInt(entryIdStr, 10);
        const rows = byEntry[entryId];
        const formatPrefix = (match: any) => match.entryUrlFormat === 'long' ? `${match.taxonomySlug}/${match.termSlug}` : match.termSlug;

        const parsedData = safeJsonParse(rows[0].entryData, {} as any);
        const termOverride = parsedData.primaryTermId;
        if (termOverride) {
            const overrideMatch = rows.find(r => r.termId === termOverride || r.termId.toString() === termOverride.toString());
            if (overrideMatch) {
                map[entryId] = formatPrefix(overrideMatch);
                continue;
            }
        }
        
        const override = parsedData.primaryTaxonomyOverride;
        if (override) {
            const overrideMatch = rows.find(r => r.taxonomySlug === override);
            if (overrideMatch) {
                map[entryId] = formatPrefix(overrideMatch);
                continue;
            }
        }

        let supportsData: any = {};
        try { supportsData = JSON.parse(rows[0].supports || '{}'); } catch(e) {}
        const priorityArray: string[] = supportsData.taxonomies || [];

        rows.sort((a, b) => {
            const idxA = priorityArray.indexOf(a.taxonomySlug);
            const idxB = priorityArray.indexOf(b.taxonomySlug);
            const rankA = idxA === -1 ? 999 : idxA;
            const rankB = idxB === -1 ? 999 : idxB;
            return rankA - rankB;
        });
        map[entryId] = formatPrefix(rows[0]);
    }
    return map;
}

export const getCanonicalUrl = async (db: any, entryId: number, entrySlug: string) => {
    const prefixRes = await db.select({ 
        termId: terms.id,
        termSlug: terms.slug, 
        taxonomySlug: taxonomies.slug,
        entryUrlFormat: taxonomies.entryUrlFormat,
        supports: collections.supports,
        entryData: entries.data
    })
        .from(entryTerms)
        .innerJoin(terms, eq(entryTerms.termId, terms.id))
        .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
        .innerJoin(entries, eq(entries.id, entryTerms.entryId))
        .innerJoin(collections, eq(entries.collectionId, collections.id))
        .where(and(eq(entryTerms.entryId, entryId), ne(taxonomies.entryUrlFormat, 'none')));
    
    if (prefixRes.length > 0) {
        const formatPrefix = (match: any) => match.entryUrlFormat === 'long' ? `${match.taxonomySlug}/${match.termSlug}` : match.termSlug;

        const parsedData = safeJsonParse(prefixRes[0].entryData, {} as any);
        const termOverride = parsedData.primaryTermId;
        if (termOverride) {
            const overrideMatch = prefixRes.find(r => r.termId === termOverride || r.termId.toString() === termOverride.toString());
            if (overrideMatch) return `${formatPrefix(overrideMatch)}/${entrySlug}`;
        }
        
        const override = parsedData.primaryTaxonomyOverride;
        if (override) {
            const overrideMatch = prefixRes.find(r => r.taxonomySlug === override);
            if (overrideMatch) return `${formatPrefix(overrideMatch)}/${entrySlug}`;
        }

        let supportsData: any = {};
        try { supportsData = JSON.parse(prefixRes[0].supports || '{}'); } catch(e) {}
        const priorityArray: string[] = supportsData.taxonomies || [];

        prefixRes.sort((a, b) => {
            const idxA = priorityArray.indexOf(a.taxonomySlug);
            const idxB = priorityArray.indexOf(b.taxonomySlug);
            const rankA = idxA === -1 ? 999 : idxA;
            const rankB = idxB === -1 ? 999 : idxB;
            return rankA - rankB;
        });

        return `${formatPrefix(prefixRes[0])}/${entrySlug}`;
    }
    return entrySlug;
};

export async function resolveRouteData(db: any, slug: string, currentPage: number = 1, pageSize: number = 12, sortTermBy: string = 'popular') {
    if (!db || !slug) return null;

    // Helper to get collections
    const getCollection = async (cSlug: string) => {
        const res = await db.select().from(collections).where(eq(collections.slug, cSlug)).limit(1);
        return res.length > 0 ? res[0] : null;
    };

    const articlesCol = await getCollection('articles');
    const pagesCol = await getCollection('pages');

    // 0. Check Date Archive (e.g., 2025/03 or 2025/03/15) — WIB (UTC+7) aware
    const dateMatch = slug.match(/^(\d{4})(?:\/(\d{1,2}))?(?:\/(\d{1,2}))?$/);
    if (dateMatch && articlesCol) {
        const year = dateMatch[1];
        const month = dateMatch[2];
        const day = dateMatch[3];

        let archiveTitle = `Arsip: ${year}`;
        if (month) {
            const monthNamesIndo = [
                'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
            ];
            const monthName = monthNamesIndo[parseInt(month, 10) - 1] || month;
            archiveTitle = day 
                ? `Arsip: ${day} ${monthName} ${year}`
                : `Arsip: ${monthName} ${year}`;
        }

        // Compute UTC bounds for the WIB date range
        const pad = (s: string, n: number) => String(s).padStart(n, '0');
        const m = month ? pad(month, 2) : '01';
        const d = day ? pad(day, 2) : '01';
        const isoStart = `${year}-${m}-${d}T00:00:00.000+07:00`;
        const utcStart = new Date(isoStart).toISOString();
        
        let utcEnd: string;
        if (day) {
            const isoEnd = `${year}-${m}-${d}T23:59:59.999+07:00`;
            utcEnd = new Date(isoEnd).toISOString();
        } else if (month) {
            const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
            const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
            const isoEnd = `${nextYear}-${pad(String(nextMonth),2)}-01T00:00:00.000+07:00`;
            utcEnd = new Date(new Date(isoEnd).getTime() - 1).toISOString();
        } else {
            const nextYear = parseInt(year) + 1;
            const isoEnd = `${nextYear}-01-01T00:00:00.000+07:00`;
            utcEnd = new Date(new Date(isoEnd).getTime() - 1).toISOString();
        }

        // Count query
        const countResult = await db.select({ count: sql<number>`count(*)` })
            .from(entries)
            .where(
                and(
                    eq(entries.collectionId, articlesCol.id),
                    eq(entries.status, 'published'),
                    gte(entries.publishedAt, utcStart),
                    lte(entries.publishedAt, utcEnd)
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
                gte(entries.publishedAt, utcStart),
                lte(entries.publishedAt, utcEnd)
            )
        )
        .orderBy(desc(entries.publishedAt))
        .limit(pageSize)
        .offset((currentPage - 1) * pageSize);

        const categoryArticles = entriesResult.map((r: any) => {
            const data = safeJsonParse(r.entry.data, {});
            const rawContent = data.content || '';
            const textOnly = rawContent.replace(/<[^>]+>/g, '').replace(/\[caption[^\]]*\]|\[\/caption\]/g, '').trim();
            const excerpt = textOnly.length > 120 ? textOnly.substring(0, 120) + '...' : textOnly;
            return {
                id: r.entry.id,
                slug: r.entry.slug,
                canonicalUrl: `/${r.entry.slug}`,
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

    // 0.5 Check Collection Archive (e.g. /articles)
    const collectionArchiveMatch = await db.select().from(collections).where(eq(collections.slug, slug)).limit(1);
    if (collectionArchiveMatch.length > 0) {
        const collection = collectionArchiveMatch[0];
        
        // Count total entries in collection
        const countResult = await db.select({ count: sql<number>`count(*)` })
            .from(entries)
            .where(
                and(
                    eq(entries.collectionId, collection.id),
                    eq(entries.status, 'published')
                )
            );
        const totalItems = Number(countResult[0]?.count || 0);
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

        // Fetch paginated entries
        const articlesResult = await db.select({
            entry: entries,
            author: users
        })
        .from(entries)
        .leftJoin(users, eq(entries.authorId, users.id))
        .where(
            and(
                eq(entries.collectionId, collection.id),
                eq(entries.status, 'published')
            )
        )
        .orderBy(desc(entries.publishedAt))
        .limit(pageSize)
        .offset((currentPage - 1) * pageSize);

        const categoryArticles = [];
        const entryIds = articlesResult.map((r: any) => r.entry.id);
        const canonicalMap = await getCanonicalUrls(db, entryIds);
        
        // Batch fetch primary categories for display
        let categoryMap: Record<number, any[]> = {};
        if (entryIds.length > 0) {
            const catTax = await db.select({ id: taxonomies.id }).from(taxonomies).where(eq(taxonomies.slug, 'categories')).limit(1);
            if (catTax.length > 0) {
                const catTermRows = await db.select({ entryId: entryTerms.entryId, id: terms.id, name: terms.name, slug: terms.slug })
                    .from(entryTerms)
                    .innerJoin(terms, eq(entryTerms.termId, terms.id))
                    .where(and(
                        eq(terms.taxonomyId, catTax[0].id),
                        sql`${entryTerms.entryId} IN (${sql.join(entryIds.map((id: any) => sql`${id}`), sql`, `)})`
                    ));
                for (const row of catTermRows) {
                    if (!categoryMap[row.entryId]) categoryMap[row.entryId] = [];
                    categoryMap[row.entryId].push(row);
                }
            }
        }

        for (const r of articlesResult) {
            const data = safeJsonParse(r.entry.data, {});
            const rawContent = data.content || '';
            const textOnly = rawContent.replace(/<[^>]+>/g, '').replace(/\[caption[^\]]*\]|\[\/caption\]/g, '').trim();
            const excerpt = textOnly.length > 120 ? textOnly.substring(0, 120) + '...' : textOnly;
            
            const prefixSlug = canonicalMap[r.entry.id];
            const canonicalPath = prefixSlug ? `/${prefixSlug}/${r.entry.slug}` : `/${r.entry.slug}`;
            
            let categoryName = 'Article';
            const cats = categoryMap[r.entry.id] || [];
            if (cats.length > 0) {
                const primary = data.primaryTermId ? cats.find((c: any) => c.id === data.primaryTermId) : null;
                categoryName = primary ? primary.name : cats[0].name;
            }

            categoryArticles.push({
                id: r.entry.id,
                slug: r.entry.slug,
                canonicalUrl: canonicalPath,
                publishedAt: r.entry.publishedAt,
                ...data,
                authorName: r.author?.name || 'Writer',
                categoryName,
                excerpt
            });
        }

        return { 
            pageType: 'collection_archive' as const, 
            data: { title: collection.label || collection.name || slug, metaTitle: `Archive: ${collection.label || slug}` }, 
            categoryArticles, 
            totalPages, 
            articleBottomHtml: '' 
        };
    }

    // 0.6 Check Taxonomy Archive (e.g. /tags)
    const taxonomyArchiveMatch = await db.select().from(taxonomies).where(and(eq(taxonomies.slug, slug), eq(taxonomies.isRouted, true))).limit(1);
    if (taxonomyArchiveMatch.length > 0) {
        const taxonomy = taxonomyArchiveMatch[0];
        
        if (taxonomy.umbrellaViewMode === 'all_entries') {
            // Count total entries in this taxonomy
            const countQuery = await db.select({ count: sql<number>`count(distinct ${entries.id})` })
                .from(entries)
                .innerJoin(entryTerms, eq(entries.id, entryTerms.entryId))
                .innerJoin(terms, eq(entryTerms.termId, terms.id))
                .where(and(
                    eq(terms.taxonomyId, taxonomy.id),
                    eq(entries.status, 'published')
                ));
            const totalItems = Number(countQuery[0]?.count || 0);
            const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

            const articlesResult = await db.select({
                entry: entries,
                author: users
            })
            .from(entries)
            .innerJoin(entryTerms, eq(entries.id, entryTerms.entryId))
            .innerJoin(terms, eq(entryTerms.termId, terms.id))
            .leftJoin(users, eq(entries.authorId, users.id))
            .where(and(
                eq(terms.taxonomyId, taxonomy.id),
                eq(entries.status, 'published')
            ))
            .groupBy(entries.id)
            .orderBy(desc(entries.publishedAt))
            .limit(pageSize)
            .offset((currentPage - 1) * pageSize);

            const categoryArticles = [];
            const entryIds = articlesResult.map((r: any) => r.entry.id);
            const canonicalMap = await getCanonicalUrls(db, entryIds);

            for (const r of articlesResult) {
                const data = safeJsonParse(r.entry.data, {});
                const rawContent = data.content || '';
                const textOnly = rawContent.replace(/<[^>]+>/g, '').replace(/\[caption[^\]]*\]|\[\/caption\]/g, '').trim();
                const excerpt = textOnly.length > 120 ? textOnly.substring(0, 120) + '...' : textOnly;
                
                const prefixSlug = canonicalMap[r.entry.id];
                const canonicalPath = prefixSlug ? `/${prefixSlug}/${r.entry.slug}` : `/${r.entry.slug}`;
                
                categoryArticles.push({
                    id: r.entry.id,
                    slug: r.entry.slug,
                    canonicalUrl: canonicalPath,
                    publishedAt: r.entry.publishedAt,
                    ...data,
                    authorName: r.author?.name || 'Writer',
                    categoryName: taxonomy.label, // Generic label since it's the umbrella page
                    excerpt
                });
            }

            return { 
                pageType: 'taxonomy_archive' as const, 
                data: { 
                    title: taxonomy.label || taxonomy.name || slug, 
                    taxonomySlug: taxonomy.slug, 
                    metaTitle: `Archive: ${taxonomy.label || slug}`,
                    omitTaxonomySlug: taxonomy.omitTaxonomySlug,
                    taxonomy: taxonomy
                }, 
                termsList: [],
                categoryArticles,
                totalPages, 
                articleBottomHtml: '' 
            };
        } else {
            // Count total terms in taxonomy
            const countResult = await db.select({ count: sql<number>`count(*)` })
                .from(terms)
                .where(eq(terms.taxonomyId, taxonomy.id));
            const totalItems = Number(countResult[0]?.count || 0);
            const umbrellaLimit = taxonomy.umbrellaItemsPerPage || 0;
            const totalPages = umbrellaLimit > 0 ? Math.max(1, Math.ceil(totalItems / umbrellaLimit)) : 1;

            let query = db.select({
                id: terms.id,
                name: terms.name,
                slug: terms.slug,
                entryCount: sql<number>`count(${entryTerms.entryId})`
            })
                .from(terms)
                .leftJoin(entryTerms, eq(terms.id, entryTerms.termId))
                .where(eq(terms.taxonomyId, taxonomy.id))
                .groupBy(terms.id)
                
            if (sortTermBy === 'az') {
                query = query.orderBy(terms.name) as any;
            } else {
                query = query.orderBy(desc(sql<number>`count(${entryTerms.entryId})`), terms.name) as any;
            }

            if (umbrellaLimit > 0) {
                query = query.limit(umbrellaLimit).offset((currentPage - 1) * umbrellaLimit) as any;
            }

            const termsList = await query;

            return { 
                pageType: 'taxonomy_archive' as const, 
                data: { 
                    title: taxonomy.label || taxonomy.name || slug, 
                    taxonomySlug: taxonomy.slug, 
                    metaTitle: `Archive: ${taxonomy.label || slug}`,
                    omitTaxonomySlug: taxonomy.omitTaxonomySlug,
                    taxonomy: taxonomy // Pass entire taxonomy to respect allowIndexing in SEO block
                }, 
                termsList, 
                totalPages, 
                articleBottomHtml: '' 
            };
        }
    }

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

        const parsedData = safeJsonParse(entry.data, {});
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

        // Generic taxonomy mapping
        const collTaxonomies: string[] = (collectionSupports as any).taxonomies || [];
        if (collTaxonomies.length > 0 || collection.slug === 'articles') {
            const entryTermsResult = await db.select({
                term: terms,
                taxonomy: taxonomies
            })
            .from(entryTerms)
            .innerJoin(terms, eq(entryTerms.termId, terms.id))
            .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
            .where(eq(entryTerms.entryId, entry.id));

            // Populate generic taxonomyTerms object
            data.taxonomyTerms = {};
            entryTermsResult.forEach((t: any) => {
                const taxSlug = t.taxonomy.slug;
                if (!data.taxonomyTerms[taxSlug]) data.taxonomyTerms[taxSlug] = [];
                
                // Determine URL based on omitTaxonomySlug
                const omitTaxSlug = t.taxonomy.omitTaxonomySlug === true || t.taxonomy.omitTaxonomySlug === 1;
                const url = omitTaxSlug ? `/${t.term.slug}` : `/${taxSlug}/${t.term.slug}`;

                data.taxonomyTerms[taxSlug].push({
                    ...t.term,
                    url
                });
            });

            // Backwards compatibility for templates expecting data.categories and data.tags
            const cats = entryTermsResult.filter((t: any) => t.taxonomy.slug === 'categories');
            const primaryTermId = parsedData.primaryTermId;
            if (primaryTermId) {
                cats.sort((a: any, b: any) => {
                    if (a.term.id === primaryTermId) return -1;
                    if (b.term.id === primaryTermId) return 1;
                    return 0;
                });
            }
            data.categories = cats.map((c: any) => ({ name: c.term.name, slug: c.term.slug }));
            data.categoryName = cats.length > 0 ? cats[0].term.name : 'Article';
            data.categorySlug = cats.length > 0 ? cats[0].term.slug : 'all';

            data.tags = entryTermsResult.filter((t: any) => t.taxonomy.slug === 'tags').map((t: any) => t.term);

            // Process Related Items if configured in layout blocks
            data.relatedItems = [];
            const layoutBlocks = (collectionSupports as any).layoutBlocks || [];
            const relatedBlock = layoutBlocks.find((b: any) => b.type === 'related_items');
            
            if (relatedBlock) {
                const targetTaxSlug = relatedBlock.config?.targetTaxonomy || data.categorySlug;
                let termIdsToMatch: number[] = [];
                
                if (targetTaxSlug && targetTaxSlug !== 'all' && data.taxonomyTerms && data.taxonomyTerms[targetTaxSlug]) {
                    termIdsToMatch = data.taxonomyTerms[targetTaxSlug].map((t: any) => t.id);
                } else if (!relatedBlock.config?.targetTaxonomy && cats.length > 0) {
                    // Fallback to primary category if Dynamic and no generic match
                    termIdsToMatch = [cats[0].term.id];
                }
                
                if (termIdsToMatch.length > 0) {
                    const relatedQuery = await db.selectDistinct({
                        id: entries.id,
                        slug: entries.slug,
                        data: entries.data,
                        publishedAt: entries.publishedAt,
                    })
                    .from(entries)
                    .innerJoin(entryTerms, eq(entries.id, entryTerms.entryId))
                    .where(
                        and(
                            inArray(entryTerms.termId, termIdsToMatch),
                            ne(entries.id, entry.id),
                            eq(entries.status, 'published')
                        )
                    )
                    .limit(4)
                    .orderBy(desc(entries.publishedAt));
                    
                    data.relatedItems = relatedQuery.map((rq: any) => {
                        const rqData = safeJsonParse(rq.data, {}) as any;
                        return {
                            id: rq.id,
                            slug: rq.slug,
                            publishedAt: rq.publishedAt,
                            title: rqData.title || '',
                            excerpt: rqData.excerpt || '',
                            featuredImageUrl: rqData.featuredImageUrl || ''
                        };
                    });
                }
            }

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
        // e.g. /category-term — prefer lower taxonomy id when multiple match
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
        .orderBy(taxonomies.id)
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

        // Strict URL Enforcement: Redirect if the visited format does not match the configured setting
        if (segments.length === 1 && !taxonomyData.allowIndexing && data.slug === 'all') {
             // Let /all pass through as usual
        } else if (segments.length === 1 && !taxonomyData.omitTaxonomySlug && data.slug !== 'all') {
            return { redirect: `/${taxonomyData.slug}/${data.slug}` };
        } else if (segments.length === 2 && taxonomyData.omitTaxonomySlug) {
            return { redirect: `/${data.slug}` };
        }
        
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
                    eq(entries.collectionId, articlesCol ? articlesCol.id : 0),
                    eq(entries.status, 'published')
                )
            ) as any;
        }
        
        const countResult = await countQuery;
        const totalItems = countResult[0]?.count || 0;
        const totalPages = Math.ceil(totalItems / pageSize);

        let articlesQuery = db.select({
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
                    eq(entries.collectionId, articlesCol ? articlesCol.id : 0),
                    eq(entries.status, 'published')
                )
            ) as any;
        }

        const articlesResult = await articlesQuery
            .orderBy(desc(entries.publishedAt))
            .limit(pageSize)
            .offset((currentPage - 1) * pageSize);

        const categoryArticles = [];
        // Batch canonical URL lookup — single query instead of N
        const entryIds = articlesResult.map((r: any) => r.entry.id);
        const canonicalMap = await getCanonicalUrls(db, entryIds);
        
        for (const r of articlesResult) {
            const data = safeJsonParse(r.entry.data, {});
            const rawContent = data.content || '';
            const textOnly = rawContent.replace(/<[^>]+>/g, '').replace(/\[caption[^\]]*\]|\[\/caption\]/g, '').trim();
            const excerpt = textOnly.length > 120 ? textOnly.substring(0, 120) + '...' : textOnly;
            
            const prefixSlug = canonicalMap[r.entry.id];
            const canonicalPath = prefixSlug ? `/${prefixSlug}/${r.entry.slug}` : `/${r.entry.slug}`;

            categoryArticles.push({
                id: r.entry.id,
                slug: r.entry.slug,
                canonicalUrl: canonicalPath,
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
