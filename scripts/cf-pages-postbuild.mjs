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
// If we leave it with absolute paths, CI rejects it. So we rewrite it with valid relative paths,
// and we merge in the bindings from the root wrangler.jsonc.
const generatedWrangler = 'dist/server/wrangler.json';
const rootWrangler = 'wrangler.jsonc';

if (fs.existsSync(generatedWrangler)) {
  const config = JSON.parse(fs.readFileSync(generatedWrangler, 'utf8'));
  let rootConfig = {};
  
  if (fs.existsSync(rootWrangler)) {
    // Basic comment stripping for JSONC
    const rawContent = fs.readFileSync(rootWrangler, 'utf8');
    const strippedContent = rawContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    try {
      rootConfig = JSON.parse(strippedContent);
    } catch (e) {
      console.warn('Could not parse root wrangler.jsonc, proceeding without it.');
    }
  }

  const newConfig = {
    name: rootConfig.name || 'waritaku',
    pages_build_output_dir: '..',
    compatibility_date: rootConfig.compatibility_date || config.compatibility_date || '2026-07-26',
    compatibility_flags: rootConfig.compatibility_flags || ['nodejs_compat', 'global_fetch_strictly_public'],
  };

  // Merge any bindings from the root config
  const bindingsToCopy = ['d1_databases', 'r2_buckets', 'kv_namespaces', 'services', 'ai', 'vectorize'];
  for (const bindingType of bindingsToCopy) {
    if (rootConfig[bindingType]) {
      newConfig[bindingType] = rootConfig[bindingType];
    }
  }

  fs.writeFileSync(generatedWrangler, JSON.stringify(newConfig, null, 2));
  console.log('✓ Fixed Astro-generated wrangler.json and merged root bindings');
}
