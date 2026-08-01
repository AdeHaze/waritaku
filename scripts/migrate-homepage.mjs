import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

// Find the SQLite database file dynamically
let dbFiles = [];
try {
    if (fs.existsSync(dbDir)) {
        dbFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.sqlite'));
    }
} catch(e) {}

if (dbFiles.length === 0) {
    console.error('No local D1 database found in .wrangler/state/v3/d1/miniflare-D1DatabaseObject/');
    process.exit(1);
}

const dbPath = join(dbDir, dbFiles[0]);
console.log(`Using database: ${dbPath}`);

const db = new Database(dbPath);

try {
    // 1. Get the current frontpage layout
    const frontpageLayoutRow = db.prepare(`SELECT value FROM settings WHERE key = 'frontpage_layout'`).get();
    
    if (!frontpageLayoutRow) {
        console.log('No frontpage_layout found in settings. Skipping migration.');
        process.exit(0);
    }
    
    const layoutBlocksJSON = frontpageLayoutRow.value;
    
    // 2. Check if a "Home" page already exists
    let homePage = db.prepare(`SELECT id FROM pages WHERE slug = 'home'`).get();
    
    let pageId;
    if (homePage) {
        console.log('Home page already exists. Updating it...');
        db.prepare(`
            UPDATE pages 
            SET layout_blocks = ?, is_block_builder = 1
            WHERE id = ?
        `).run(layoutBlocksJSON, homePage.id);
        pageId = homePage.id;
    } else {
        console.log('Creating new Home page...');
        const result = db.prepare(`
            INSERT INTO pages (title, slug, content, status, published_at, is_block_builder, layout_blocks)
            VALUES ('Magazine Home', 'home', '', 'published', datetime('now'), 1, ?)
        `).run(layoutBlocksJSON);
        pageId = result.lastInsertRowid;
    }
    
    // 3. Set the homepage_page_id setting
    console.log(`Setting homepage_page_id to ${pageId}...`);
    
    const existingSetting = db.prepare(`SELECT key FROM settings WHERE key = 'homepage_page_id'`).get();
    if (existingSetting) {
        db.prepare(`UPDATE settings SET value = ? WHERE key = 'homepage_page_id'`).run(pageId.toString());
    } else {
        db.prepare(`INSERT INTO settings (key, value) VALUES ('homepage_page_id', ?)`).run(pageId.toString());
    }
    
    console.log('Migration completed successfully!');

} catch (error) {
    console.error('Error during migration:', error);
} finally {
    db.close();
}
