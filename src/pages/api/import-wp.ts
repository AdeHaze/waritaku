import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';
import { users, taxonomies, terms, collections, entries, entryTerms } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export const POST: APIRoute = async ({ request }) => {
    try {
        const payload = await request.json();
        const db = getDb(env);

        if (payload.version !== '2.0' && payload.version !== '1.0') {
            return new Response(JSON.stringify({ error: 'Invalid payload version.' }), { status: 400 });
        }

        const validUserIds = new Set(payload.users?.map((u: any) => Number(u.id)) || []);
        const validEntryIds = new Set();
        if (payload.collections) {
            Object.values(payload.collections).forEach((entries: any) => entries.forEach((e: any) => validEntryIds.add(Number(e.id))));
        }
        const validTermIds = new Set();
        if (payload.taxonomies) {
            Object.values(payload.taxonomies).forEach((terms: any) => terms.forEach((t: any) => validTermIds.add(Number(t.id))));
        }

        // 1. Insert Users
        if (payload.users && payload.users.length > 0) {
            for (let i = 0; i < payload.users.length; i += 10) {
                const chunk = payload.users.slice(i, i + 10).map((u: any) => ({
                    id: u.id,
                    name: u.name,
                    slug: u.slug,
                    email: u.email,
                    passwordHash: u.passwordHash,
                    role: u.role || 'user',
                    createdAt: u.createdAt || new Date().toISOString()
                }));
                await db.insert(users).values(chunk).onConflictDoNothing().run();
            }
        }

        // 2. Insert Collections & Entries
        if (payload.collections) {
            const collSlugs = Object.keys(payload.collections);
            for (const collSlug of collSlugs) {
                const collName = collSlug.charAt(0).toUpperCase() + collSlug.slice(1);
                
                await db.insert(collections).values({
                    slug: collSlug,
                    label: collName,
                    labelSingular: collName,
                    routePrefix: `/${collSlug}`,
                    fields: '[]',
                    supports: '{"drafts":true}'
                }).onConflictDoNothing().run();
                
                const collObj = await db.select().from(collections).where(eq(collections.slug, collSlug)).get();
                if (collObj) {
                    const entriesToInsert = payload.collections[collSlug].map((e: any) => {
                        const dataObj = {
                            title: e.title,
                            content: e.content,
                            visibility: e.password ? 'password' : 'public',
                            password: e.password || null,
                            featuredImage: e.featuredImageUrl || null,
                            featuredImageUrl: e.featuredImageUrl || null,
                            metaTitle: e.metaTitle || null,
                            metaDescription: e.metaDescription || null
                        };
                        return {
                            id: e.id,
                            collectionId: collObj.id,
                            slug: e.slug,
                            status: e.status,
                            authorId: validUserIds.has(Number(e.authorId)) ? Number(e.authorId) : null,
                            data: JSON.stringify(dataObj),
                            createdAt: e.publishedAt || new Date().toISOString(),
                            updatedAt: e.publishedAt || new Date().toISOString(),
                            publishedAt: e.publishedAt
                        };
                    });

                    for (let i = 0; i < entriesToInsert.length; i += 10) {
                        const chunk = entriesToInsert.slice(i, i + 10);
                        await db.insert(entries).values(chunk).onConflictDoNothing().run();
                    }
                }
            }
        }

        // 3. Insert Taxonomies & Terms
        if (payload.taxonomies) {
            const taxAlias: Record<string, string> = {
                'category': 'categories',
                'post_tag': 'tags'
            };
            const taxSlugs = Object.keys(payload.taxonomies);
            for (const rawSlug of taxSlugs) {
                const tSlug = taxAlias[rawSlug] || rawSlug;
                const tName = tSlug.charAt(0).toUpperCase() + tSlug.slice(1);
                
                await db.insert(taxonomies).values({
                    slug: tSlug,
                    label: tName,
                    allowedCollections: '[]'
                }).onConflictDoNothing().run();

                const taxObj = await db.select().from(taxonomies).where(eq(taxonomies.slug, tSlug)).get();
                if (taxObj) {
                    const termsToInsert = payload.taxonomies[rawSlug].map((t: any) => ({
                        id: t.id,
                        taxonomyId: taxObj.id,
                        name: t.name,
                        slug: t.slug,
                        description: t.description || '',
                        parentId: validTermIds.has(Number(t.parentId)) ? Number(t.parentId) : null
                    }));

                    for (let i = 0; i < termsToInsert.length; i += 10) {
                        const chunk = termsToInsert.slice(i, i + 10);
                        await db.insert(terms).values(chunk).onConflictDoNothing().run();
                    }
                }
            }
        }

        // 4. Insert Entry Terms
        if (payload.term_relationships && payload.term_relationships.length > 0) {
            const dbEntryIds = new Set((await db.select({ id: entries.id }).from(entries).all()).map(e => e.id));
            const dbTermIds = new Set((await db.select({ id: terms.id }).from(terms).all()).map(t => t.id));

            const uniqueRels = [];
            const seenRels = new Set();
            for (const r of payload.term_relationships) {
                if (!dbEntryIds.has(Number(r.entryId)) || !dbTermIds.has(Number(r.termId))) continue;
                
                const key = `${r.entryId}-${r.termId}`;
                if (!seenRels.has(key)) {
                    seenRels.add(key);
                    uniqueRels.push({ entryId: r.entryId, termId: r.termId });
                }
            }

            for (let i = 0; i < uniqueRels.length; i += 50) {
                const chunk = uniqueRels.slice(i, i + 50);
                await db.insert(entryTerms).values(chunk).onConflictDoNothing().run();
            }
        }

        return new Response(JSON.stringify({ success: true, message: "Import completed successfully." }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (e: any) { console.error('D1 Error Cause:', e.cause); console.error(e);
        return new Response(JSON.stringify({ error: e.message, cause: e.cause ? e.cause.message : null }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
