const Database = require('better-sqlite3');
const dbPath = 'C:\\Users\\KBSV\\Documents\\antigravity\\kbtest\\.wrangler\\state\\v3\\d1\\miniflare-D1DatabaseObject\\0a146a8d831fb1a054548f5e34939b2fe50087aa664ce60c4a81b8eefd40fdea.sqlite';
const db = new Database(dbPath);

console.log('Seeding layoutBlocks into collections (kbtest)...');

const getStmt = db.prepare('SELECT id, slug, supports FROM collections WHERE slug IN (?, ?)');
const updateStmt = db.prepare('UPDATE collections SET supports = ? WHERE id = ?');

const cols = getStmt.all('articles', 'pages');

for (const col of cols) {
    let supports = {};
    try {
        if (col.supports) supports = JSON.parse(col.supports);
    } catch(e) {}
    
    if (col.slug === 'articles') {
        supports.layoutBlocks = [
            { id: 'b_bread', type: 'breadcrumbs', config: {} },
            { id: 'b_hero', type: 'hero', config: {} },
            { id: 'b_body', type: 'body_content', config: {} },
            { id: 'b_rel', type: 'related_items', config: {} }
        ];
    } else if (col.slug === 'pages') {
        supports.layoutBlocks = [
            { id: 'b_bread', type: 'breadcrumbs', config: {} },
            { id: 'b_hero', type: 'hero', config: {} },
            { id: 'b_body', type: 'body_content', config: {} }
        ];
    }
    
    updateStmt.run(JSON.stringify(supports), col.id);
    console.log(`Updated ${col.slug} successfully.`);
}

console.log('Done.');
