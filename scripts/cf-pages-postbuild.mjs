import fs from 'fs';
import path from 'path';

const workerSrc = 'dist/server/entry.mjs';
const workerDest = 'dist/_worker.js';

// Check if Astro generated a server entrypoint
if (fs.existsSync(workerSrc)) {
  // Re-export the worker so Cloudflare Pages recognizes it as a function
  fs.writeFileSync(workerDest, 'export { default } from \'./server/entry.mjs\';');
  console.log('✓ Generated dist/_worker.js for Cloudflare Pages compatibility');
}

// Move static assets from dist/client/ to dist/
if (fs.existsSync('dist/client')) {
  const clientFiles = fs.readdirSync('dist/client');
  for (const f of clientFiles) {
    fs.renameSync(path.join('dist/client', f), path.join('dist', f));
  }
  fs.rmdirSync('dist/client');
  console.log('✓ Moved client assets to dist root');
}

// Delete Astro's auto-generated wrangler.json so Cloudflare Pages uses our root wrangler.jsonc
// (If Cloudflare sees this file, it might skip our config and ignore nodejs_compat!)
const generatedWrangler = 'dist/server/wrangler.json';
if (fs.existsSync(generatedWrangler)) {
  fs.unlinkSync(generatedWrangler);
  console.log('✓ Deleted Astro-generated wrangler.json to ensure nodejs_compat is applied');
}
