import fs from 'fs';
import path from 'path';

const workerSrc = 'dist/server/entry.mjs';
const workerDest = 'dist/_worker.js';

// Check if Astro generated a server entrypoint
if (fs.existsSync(workerSrc)) {
  // Re-export the worker with a scheduled handler for D1 PRAGMA optimize
  const workerCode = `
import astroApp from './server/entry.mjs';

export default {
  fetch: astroApp.fetch,
  async scheduled(event, env, ctx) {
    if (env.DB) {
      console.log('Running PRAGMA optimize on D1...');
      await env.DB.prepare('PRAGMA optimize;').run();
      console.log('PRAGMA optimize complete.');
    }
  }
};
`;
  fs.writeFileSync(workerDest, workerCode);
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

// Safe cleanup of only the .wrangler/deploy folder to not destroy the local DB
if (fs.existsSync('.wrangler/deploy')) {
  try {
    fs.rmdirSync('.wrangler/deploy');
  } catch (e) {
    // Ignore errors if not empty
  }
}
