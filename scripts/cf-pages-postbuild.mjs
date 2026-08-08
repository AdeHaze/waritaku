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

// Fix Astro's auto-generated wrangler.json instead of deleting it!
// Cloudflare Pages CI creates a redirect cache pointing to this file. If we delete it, CI crashes.
// If we leave it with absolute paths, CI rejects it. So we rewrite it with valid relative paths
// and ensure nodejs_compat is included!
const generatedWrangler = 'dist/server/wrangler.json';
if (fs.existsSync(generatedWrangler)) {
  const config = JSON.parse(fs.readFileSync(generatedWrangler, 'utf8'));
  const newConfig = {
    name: 'waritaku',
    pages_build_output_dir: '..',
    compatibility_date: config.compatibility_date || '2026-07-26',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    d1_databases: [
      {
        binding: "DB",
        database_name: "waritaku-d1",
        database_id: "57c02531-4715-44fe-ba8c-cbaf4176345f"
      }
    ]
  };
  fs.writeFileSync(generatedWrangler, JSON.stringify(newConfig, null, 2));
  console.log('✓ Fixed Astro-generated wrangler.json to ensure strict Cloudflare Pages validation passes');
}
