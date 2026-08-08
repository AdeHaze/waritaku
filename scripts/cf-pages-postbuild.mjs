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

// Remove Astro's auto-generated wrangler configs to unlock Cloudflare Dashboard bindings!
// If Cloudflare Pages detects wrangler.json or .wrangler/deploy/config.json, it locks 
// the Cloudflare Dashboard and forces you to use the file for bindings.
// By deleting these, we allow you to configure D1 and R2 directly in the Cloudflare Dashboard.
const generatedWrangler = 'dist/server/wrangler.json';
const deployConfig = '.wrangler/deploy/config.json';
const rootWranglerDeploy = '.wrangler';

if (fs.existsSync(generatedWrangler)) {
  fs.unlinkSync(generatedWrangler);
  console.log('✓ Deleted dist/server/wrangler.json to unlock Dashboard bindings');
}

if (fs.existsSync(deployConfig)) {
  fs.unlinkSync(deployConfig);
  console.log('✓ Deleted .wrangler/deploy/config.json to unlock Dashboard bindings');
}

// Clean up the .wrangler directory if it's empty
if (fs.existsSync(rootWranglerDeploy)) {
  try {
    fs.rmSync(rootWranglerDeploy, { recursive: true, force: true });
  } catch (e) {
    // Ignore errors
  }
}
