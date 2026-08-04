const { execSync } = require('child_process');
const fs = require('fs');

try {
    const output = execSync('npx wrangler d1 execute waritaku_db --local --command="SELECT id, name, slug FROM tags" --json', { encoding: 'utf8' });
    fs.writeFileSync('tags.json', output, 'utf8');
    console.log("Successfully dumped tags to tags.json in UTF-8.");
} catch (e) {
    console.error(e);
}
