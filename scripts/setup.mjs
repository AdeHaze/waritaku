#!/usr/bin/env node
import { intro, outro, select, text, isCancel, cancel, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Helper to run shell commands gracefully
function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: true, stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

// Helper to run commands silently but capture output
function runCommandSilent(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: true });
    let output = '';
    child.stdout.on('data', d => output += d);
    child.stderr.on('data', d => output += d);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Command failed: ${output}`));
    });
  });
}

async function main() {
  console.clear();
  intro(pc.bgCyan(pc.black(' 🚀 Waritaku CMS Setup & Migration Wizard ')));

  // Task 1: Setup D1 Database
  const setupDb = await select({
    message: 'Step 1: Set up the local Cloudflare D1 database schema?',
    options: [
      { value: 'yes', label: 'Yes, apply migrations locally (Recommended)' },
      { value: 'no', label: 'No, skip database setup' }
    ]
  });
  if (isCancel(setupDb)) { cancel('Setup cancelled.'); process.exit(0); }

  if (setupDb === 'yes') {
    const s = spinner();
    s.start('Applying Drizzle migrations to local D1 (wrangler)...');
    try {
      await runCommandSilent('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local'], PROJECT_ROOT);
      s.stop(pc.green('Database schema applied successfully!'));
    } catch (e) {
      s.stop(pc.red('Failed to apply migrations. Please ensure you ran npm install.'));
      console.error(e);
    }
  }

  // Task 2: Parse WP SQL
  const migrateWp = await select({
    message: 'Step 2: Do you want to migrate a WordPress .sql dump?',
    options: [
      { value: 'yes', label: 'Yes, parse my WordPress .sql file' },
      { value: 'no', label: 'No, skip WordPress data migration' }
    ]
  });
  if (isCancel(migrateWp)) { cancel('Setup cancelled.'); process.exit(0); }

  if (migrateWp === 'yes') {
    const sqlPath = await text({
      message: 'Enter the path to your WordPress .sql dump file:',
      placeholder: '../waritaku_com.sql',
      validate(value) {
        if (!value) return 'Path is required';
        const absolutePath = path.resolve(process.cwd(), value);
        if (!fs.existsSync(absolutePath)) return `File not found: ${absolutePath}`;
      }
    });
    if (isCancel(sqlPath)) { cancel('Setup cancelled.'); process.exit(0); }

    const s = spinner();
    s.start('Parsing SQL dump and generating import_payload.json (this may take a few seconds)...');
    try {
      await runCommandSilent('node', ['scripts/wp-import.mjs', sqlPath], PROJECT_ROOT);
      s.stop(pc.green('✓ Payload generated successfully at scripts/import_payload.json!'));
      console.log(pc.cyan('  ↳ Note: You will upload this payload in the CMS dashboard later.'));
    } catch (e) {
      s.stop(pc.red('Failed to parse SQL file.'));
      console.error(e);
    }
  }

  // Task 3: Migrate Images
  const migrateImages = await select({
    message: 'Step 3: Do you want to migrate WordPress images (wp-content/uploads)?',
    options: [
      { value: 'yes', label: 'Yes, migrate images locally' },
      { value: 'no', label: 'No, skip image migration' }
    ]
  });
  if (isCancel(migrateImages)) { cancel('Setup cancelled.'); process.exit(0); }

  if (migrateImages === 'yes') {
    const wpUploadsPath = await text({
      message: 'Enter the path to your wp-content/uploads directory:',
      placeholder: '../public_html/wp-content/uploads',
      validate(value) {
        if (!value) return 'Path is required';
        const absolutePath = path.resolve(process.cwd(), value);
        if (!fs.existsSync(absolutePath)) return `Directory not found: ${absolutePath}`;
        if (!fs.statSync(absolutePath).isDirectory()) return `Path is not a directory: ${absolutePath}`;
      }
    });
    if (isCancel(wpUploadsPath)) { cancel('Setup cancelled.'); process.exit(0); }

    const convertWebp = await select({
      message: 'Convert original images to WebP? (Takes longer, but highly recommended for performance)',
      options: [
        { value: 'yes', label: 'Yes, convert to WebP' },
        { value: 'no', label: 'No, just copy files as-is' }
      ]
    });
    if (isCancel(convertWebp)) { cancel('Setup cancelled.'); process.exit(0); }

    console.log(pc.cyan('\nStarting Image Migration Pipeline...'));
    const args = ['scripts/wp-import-images.mjs', wpUploadsPath, './local_uploads'];
    if (convertWebp === 'yes') args.push('--webp');
    
    try {
      await runCommand('node', args, PROJECT_ROOT);
      console.log(pc.green('\n✓ Image migration complete!'));
      console.log(pc.cyan('  ↳ Note: You can push these to production later via `npm run push:media`'));
    } catch (e) {
      console.error(pc.red('\nImage migration failed.'), e);
    }
  }

  // Task 4: Start Dev Server
  const startDev = await select({
    message: 'Setup complete! Do you want to start the local development server now?',
    options: [
      { value: 'yes', label: 'Yes, run `npm run dev`' },
      { value: 'no', label: 'No, exit' }
    ]
  });
  if (isCancel(startDev)) { cancel('Setup complete.'); process.exit(0); }

  outro(pc.bgGreen(pc.black(' 🎉 Setup Complete! ')));

  if (startDev === 'yes') {
    console.log(pc.gray('\nStarting dev server... (Press Ctrl+C to stop)'));
    if (migrateWp === 'yes') {
      console.log(pc.yellow('➜ Remember to visit http://localhost:4321/admin/system to upload your import_payload.json!\n'));
    }
    await runCommand('npm', ['run', 'dev'], PROJECT_ROOT);
  }
}

main().catch(console.error);
