const fs = require('fs');

const superadminRes = ['entries', 'media', 'taxonomies', 'taxonomy_terms', 'users', 'settings', 'content_builder', 'taxonomy_builder', 'layout', 'redirects', 'system'];
const adminRes = ['entries', 'media', 'taxonomies', 'taxonomy_terms', 'users', 'taxonomy_builder', 'redirects'];
const editorRes = ['entries', 'media', 'taxonomies', 'taxonomy_terms'];
const actions = ['read', 'create', 'edit_own', 'edit_others', 'delete_own', 'delete_others'];

const writerPerms = [
  ['entries', 'read'], ['entries', 'create'], ['entries', 'edit_own'], ['entries', 'delete_own'],
  ['media', 'read'], ['media', 'create'], ['media', 'delete_own'],
  ['taxonomies', 'read'], ['taxonomy_terms', 'read'],
  ['content_builder', 'read'], ['taxonomy_builder', 'read']
];

let sql = '-- Seed role_permissions\n\n';

const generateValues = (role, resList, acts) => {
    let result = '';
    for (const r of resList) {
        for (const a of acts) {
            result += `  ((SELECT id FROM \`roles\` WHERE slug = '${role}'), '${r}', '${a}'),\n`;
        }
    }
    return result;
}

sql += 'INSERT INTO `role_permissions` (`role_id`, `resource`, `action`) VALUES\n';
sql += generateValues('superadmin', superadminRes, actions);
sql += generateValues('admin', adminRes, actions);
sql += generateValues('editor', editorRes, actions);

let writerStr = '';
for (const p of writerPerms) {
    writerStr += `  ((SELECT id FROM \`roles\` WHERE slug = 'writer'), '${p[0]}', '${p[1]}'),\n`;
}

sql += writerStr;

// Remove last comma and add semicolon
sql = sql.slice(0, -2) + ';\n';

fs.writeFileSync('C:/Users/KBSV/Documents/antigravity/waritaku/drizzle/0027_hoshikawa_sara.sql', sql);
