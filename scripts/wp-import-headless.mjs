import Database from 'better-sqlite3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const PAYLOAD_PATH = resolve(__dirname, 'import_payload.json');

console.log('─────────────────────────────────────────────────────────────────');
console.log(' WordPress → Waritaku CMS (Headless Schema) Importer');
console.log('─────────────────────────────────────────────────────────────────\n');

// 1. Locate the active D1 database
const d1Dir = join(PROJECT_ROOT, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
let dbPath = null;
try {
    const files = readdirSync(d1Dir);
    const sqliteFiles = files.filter(f => f.endsWith('.sqlite') && !f.startsWith('metadata'));
    
    // Sort by modified time to get the most recent one
    sqliteFiles.sort((a, b) => {
        return statSync(join(d1Dir, b)).mtimeMs - statSync(join(d1Dir, a)).mtimeMs;
    });

    if (sqliteFiles.length > 0) {
        dbPath = join(d1Dir, sqliteFiles[0]);
    }
} catch (e) {
    console.error('❌ Could not read D1 directory. Have you started the dev server at least once?');
    process.exit(1);
}

if (!dbPath) {
    console.error('❌ Could not find a .sqlite file in the D1 state directory.');
    process.exit(1);
}

console.log(`✓ Found D1 Database: ${dbPath}`);

// 2. Read Payload
console.log(`✓ Reading payload: ${PAYLOAD_PATH}...`);
let payload;
try {
    payload = JSON.parse(readFileSync(PAYLOAD_PATH, 'utf8'));
} catch (e) {
    console.error('❌ Failed to read import_payload.json:', e.message);
    process.exit(1);
}

const db = new Database(dbPath);

// Enable WAL for performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

try {
    db.exec('BEGIN TRANSACTION;');

    // ─── 3. Seed Collections ──────────────────────────────────────────────
    console.log('Creating base collections...');
    const insertCol = db.prepare(`
        INSERT INTO collections (slug, label, label_singular, description, icon, route_prefix, fields, supports)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET slug=slug
        RETURNING id;
    `);

    const colIds = {};
    const colFields = JSON.stringify([
        { slug: 'title', label: 'Title', type: 'text', required: true },
        { slug: 'content', label: 'Content', type: 'rich_content' },
        { slug: 'featuredImageUrl', label: 'Featured Image', type: 'image' },
        { slug: 'metaTitle', label: 'SEO Title', type: 'text' },
        { slug: 'metaDescription', label: 'SEO Description', type: 'text' },
    ]);

    for (const colSlug of Object.keys(payload.collections)) {
        let label = colSlug.charAt(0).toUpperCase() + colSlug.slice(1);
        if (!label.endsWith('s')) label += 's'; // simple pluralize
        const labelSingular = colSlug.charAt(0).toUpperCase() + colSlug.slice(1);
        
        const row = insertCol.get(colSlug, label, labelSingular, `Imported ${colSlug}`, 'FileText', '/', colFields, '{}');
        colIds[colSlug] = row.id;
    }

    // ─── 4. Seed Taxonomies ───────────────────────────────────────────────
    console.log('Creating taxonomies...');
    const insertTax = db.prepare(`
        INSERT INTO taxonomies (slug, label, allowed_collections, is_routed, prefix_entry_url, allow_indexing)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET label=excluded.label
        RETURNING id;
    `);

    const taxIds = {};
    for (const taxSlug of Object.keys(payload.taxonomies)) {
        const label = taxSlug.charAt(0).toUpperCase() + taxSlug.slice(1).replace(/_/g, ' ');
        // Allow all imported collections to use this taxonomy
        const allowedCols = JSON.stringify(Object.keys(payload.collections));
        // Simple heuristic: if the slug is a category-like taxonomy, prefix URLs
        const prefixUrl = (taxSlug.includes('category') || taxSlug.includes('cat')) ? 1 : 0;
        
        const row = insertTax.get(taxSlug, label, allowedCols, 1, prefixUrl, 1);
        taxIds[taxSlug] = row.id;
    }


    // ─── 5. Migrate Users ────────────────────────────────────────────────
    console.log(`Migrating ${payload.users.length} users...`);
    const insertUser = db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, slug, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
            name=excluded.name, email=excluded.email, password_hash=excluded.password_hash;
    `);

    for (const u of payload.users) {
        insertUser.run(
            u.id, u.name || u.username, u.email || `${u.username}@example.com`,
            u.passwordHash || '', u.role || 'editor', u.slug || u.username,
            u.createdAt || new Date().toISOString()
        );
    }


    // ─── 6. Migrate Terms ────────────────────────────────────────────────
    console.log(`Migrating terms dynamically...`);
    const insertTerm = db.prepare(`
        INSERT INTO terms (taxonomy_id, parent_id, name, slug)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET name=excluded.name
        RETURNING id;
    `);

    // We need to keep a map of WP term IDs to new SQLite Term IDs
    const wpTermToSqliteTerm = new Map();

    for (const [taxSlug, terms] of Object.entries(payload.taxonomies)) {
        const taxId = taxIds[taxSlug];
        for (const t of terms) {
            const row = insertTerm.get(taxId, null, t.name, t.slug);
            wpTermToSqliteTerm.set(t.id, row.id);
        }
    }


    // ─── 7. Migrate Entries (Articles, Pages, Custom) ───────────────────────────
    console.log(`Migrating all entries...`);
    
    // We will clear existing entry_terms for these entries to prevent duplicate primary keys on upsert
    const deleteEntryTerms = db.prepare(`DELETE FROM entry_terms WHERE entry_id = ?`);

    const insertEntry = db.prepare(`
        INSERT INTO entries (collection_id, slug, status, author_id, data, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET 
            data=excluded.data, status=excluded.status, published_at=excluded.published_at
        RETURNING id;
    `);

    const insertEntryTerm = db.prepare(`
        INSERT INTO entry_terms (entry_id, term_id)
        VALUES (?, ?)
        ON CONFLICT DO NOTHING;
    `);

    const validUserIds = new Set(payload.users.map(u => u.id));
    const wpArticleToSqliteEntry = new Map();
    
    for (const [colSlug, entries] of Object.entries(payload.collections)) {
        const colId = colIds[colSlug];
        for (const entry of entries) {
            const customData = {
                title: entry.title,
                content: entry.content,
                featuredImageUrl: entry.featuredImageUrl,
                metaTitle: entry.metaTitle,
                metaDescription: entry.metaDescription,
                visibility: entry.visibility || 'public',
                password: entry.password || null,
                is_block_builder: colSlug === 'page' ? false : undefined // special flag for pages
            };
            
            // Fix: ensure authorId exists in payload.users, otherwise null
            const safeAuthorId = validUserIds.has(entry.authorId) ? entry.authorId : null;
            
            const row = insertEntry.get(
                colId,
                entry.slug,
                entry.status || 'draft',
                safeAuthorId,
                JSON.stringify(customData),
                entry.publishedAt || new Date().toISOString(),
                new Date().toISOString(),
                entry.publishedAt || new Date().toISOString()
            );

            wpArticleToSqliteEntry.set(entry.id, row.id);
            deleteEntryTerms.run(row.id); // clear existing terms to allow fresh insertion
        }
    }


    // ─── 8. Map Relationships ────────────────────────────────────────────
    console.log(`Mapping relationships...`);
    let termLinksCount = 0;

    for (const rel of payload.term_relationships) {
        const entryId = wpArticleToSqliteEntry.get(rel.entryId);
        const termId = wpTermToSqliteTerm.get(rel.termId);
        if (entryId && termId) {
            insertEntryTerm.run(entryId, termId);
            termLinksCount++;
        }
    }

    db.exec('COMMIT;');
    console.log(`\n🎉 Headless Import Completed Successfully!`);
    console.log(`   Linked ${termLinksCount} terms to entries.`);

} catch (e) {
    db.exec('ROLLBACK;');
    console.error('❌ Migration failed:', e);
    process.exit(1);
}

db.close();
