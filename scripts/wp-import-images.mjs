#!/usr/bin/env node
/**
 * WordPress → Waritaku CMS Image Migration Pipeline  v1.1
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans a WordPress wp-content/uploads directory. For each original image,
 * copies (or converts to WebP) to local_uploads/, preserving year/month paths.
 *
 * What it skips:
 *   • WordPress resized variants  —  image-300x200.jpg, image-1024x768.png
 *   • WordPress WebP companions   —  image.jpg.webp, image-300x200.jpg.webp
 *     (WordPress 5.3+ generates these automatically alongside every upload)
 *   • Duplicate files (same size + same filename = likely duplicate)
 *
 * Usage:
 *   node scripts/wp-import-images.mjs [wp-uploads-src] [local-uploads-dest] [flags]
 *
 * Flags:
 *   --webp       Convert JPEG/PNG originals to WebP (54% smaller, 20-40 min)
 *   --dry-run    Scan and report counts without copying anything
 *   --clean      Delete local_uploads/ before starting (use after a failed run)
 *   --force      Skip the "destination already has files" safety prompt
 *   --help       Show this help text
 *
 * Defaults (paths are relative to project root):
 *   wp-uploads-src:     ../waritaku.old/public_html/wp-content/uploads
 *   local-uploads-dest: ./local_uploads
 *
 * Typical workflow:
 *   1. node scripts/wp-import.mjs             (parse SQL → import_payload.json)
 *   2. node scripts/wp-import-images.mjs      (copy images → local_uploads/)
 *      OR with WebP:
 *      node scripts/wp-import-images.mjs --clean --webp
 *   3. Upload import_payload.json at /admin/system → WordPress Import
 *
 * Outputs:
 *   scripts/image_url_map.json  — { "/wp-content/uploads/Y/M/img.jpg": "/uploads/Y/M/img.jpg" }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, mkdirSync, copyFileSync, rmSync,
         readdirSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'fs';
import { join, relative, extname, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const FLAG_WEBP    = args.includes('--webp');
const FLAG_DRYRUN  = args.includes('--dry-run');
const FLAG_CLEAN   = args.includes('--clean');
const FLAG_FORCE   = args.includes('--force');
const FLAG_HELP    = args.includes('--help') || args.includes('-h');
const posArgs      = args.filter(a => !a.startsWith('--') && !a.startsWith('-'));

const SRC_DIR = posArgs[0]
  ? resolve(process.cwd(), posArgs[0])
  : resolve(PROJECT_ROOT, '..', 'waritaku.old', 'public_html', 'wp-content', 'uploads');

const DEST_DIR = posArgs[1]
  ? resolve(process.cwd(), posArgs[1])
  : resolve(PROJECT_ROOT, 'local_uploads');

const URL_MAP_PATH = resolve(__dirname, 'image_url_map.json');

// ── Image extensions we handle ─────────────────────────────────────────────────────────────────
const IMAGE_EXTS    = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp',
                               '.bmp', '.tiff', '.tif', '.svg', '.ico']);
const MEDIA_EXTS    = new Set(['.mp4', '.webm', '.ogv', '.mov', '.mp3',
                               '.ogg', '.wav', '.pdf']);
const CONVERT_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif']);

// ── WordPress-generated file filters ─────────────────────────────────────────────────────
//
// WordPress creates TWO types of derived files for every upload:
//
//  Type A — Resized variants:     image-300x200.jpg, image-1024x768.png
//           Regex: WP_RESIZED_RE
//
//  Type B — WebP companions:      image.jpg.webp, image-300x200.jpg.webp
//           (WordPress 5.3+ generates these in addition to the JPEG/PNG originals)
//           Identified by: double extension ending in .webp (e.g., .jpg.webp, .png.webp)
//
// We want NEITHER of these. We only want the true original.

// Matches: -300x200.jpg  -1024x768.png  -150x150@2x.jpg  -1536x864.webp
// Matches also: -300x230.bk.webp (or other trailing suffixes inserted before extension)
// Does NOT match: -scaled.jpg  (that's the processed original, keep it)
const WP_RESIZED_RE = /-\d{2,5}x\d{2,5}(?:@\dx)?(?:[-.a-z0-9_]*)\.(jpe?g|png|gif|webp|bmp|tiff?)$/i;

// Type B: image.jpg.webp, image-300x200.jpg.webp (WordPress 5.3+ WebP companions)
const WP_WEBP_COMPANION_RE = /\.(jpe?g|png|gif|bmp|tiff?)\.webp$/i;

// Type C: image.bk.jpg, image.bak.png (Plugin backups from Smush, ShortPixel, etc)
const WP_BACKUP_RE = /\.(?:bk|bak)\.(?:jpe?g|png|gif|webp|bmp|tiff?)$/i;

function isWordPressGenerated(filePath, filename) {
  // Check Type B: image.jpg.webp (WebP companions)
  if (WP_WEBP_COMPANION_RE.test(filename)) return true;
  
  // Check Type C: image.bk.jpg (Plugin backups)
  if (WP_BACKUP_RE.test(filename)) return true;

  // Check Type A: Resized variants (e.g. image-1536x864-1.jpg)
  // We extract what the original filename WOULD be (e.g. image-1.jpg).
  // If that original file ACTUALLY EXISTS in the same directory, then THIS file
  // is definitely just a WordPress-generated thumbnail.
  // If the original file DOES NOT EXIST, then THIS file is the true original
  // (it just happens to have dimensions in its name), so we DO NOT skip it!
  const match = filename.match(/^(.*?)(-\d{2,5}x\d{2,5}(?:@\dx)?(?:[-.a-z0-9_]*))(\.(?:jpe?g|png|gif|webp|bmp|tiff?))$/i);
  if (match) {
    const originalName = match[1] + match[3];
    const originalPath = join(dirname(filePath), originalName);
    if (existsSync(originalPath)) {
      return true; // We found the original, so this is a thumbnail.
    }
  }

  return false;
}

// ── Fast MD5 of first 64KB (for dedup heuristic, not cryptographic) ──────────────────────────────
function quickHash(filePath) {
  try {
    const fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(65536);
    const bytesRead = readSync(fd, buf, 0, 65536, 0);
    closeSync(fd);
    return createHash('md5').update(buf.subarray(0, bytesRead)).digest('hex');
  } catch {
    return null;
  }
}

// ── Recursive directory walker ────────────────────────────────────────────────────────────────────────────────
function* walkDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    try {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        yield* walkDir(fullPath);
      } else if (entry.isFile()) {
        yield fullPath;
      }
    } catch {
      continue;
    }
  }
}

// ── Ensure directory exists ──────────────────────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── --help ──────────────────────────────────────────────────────────────────
if (FLAG_HELP) {
  console.log([
    '',
    'WordPress → Waritaku CMS  Image Migration Pipeline  v1.1',
    '',
    'Usage:',
    '  node scripts/wp-import-images.mjs [src] [dest] [flags]',
    '',
    'Arguments:',
    '  src     Path to WordPress wp-content/uploads/ directory',
    '          Default: ../waritaku.old/public_html/wp-content/uploads',
    '  dest    Destination local_uploads/ directory',
    '          Default: ./local_uploads',
    '',
    'Flags:',
    '  --webp      Convert JPEG/PNG originals to WebP (smaller files, slower)',
    '  --dry-run   Count files only. Nothing is copied.',
    '  --clean     Delete dest/ before starting. Use this if you ran before',
    '              without --webp and now want to start fresh with --webp.',
    '  --force     Skip the destination-exists safety check.',
    '  --help      Show this help text.',
    '',
    'Examples:',
    '  # First-time: copy originals as-is (fast, ~80s for 65k files)',
    '  node scripts/wp-import-images.mjs',
    '',
    '  # Convert to WebP for smaller storage (~30min for 65k files)',
    '  node scripts/wp-import-images.mjs --clean --webp',
    '',
    '  # Use a different WordPress site',
    '  node scripts/wp-import-images.mjs ../mysite.old/wp-content/uploads ./local_uploads',
    '',
    '  # Dry run first to see what will happen',
    '  node scripts/wp-import-images.mjs --dry-run',
    '',
    'What it skips:',
    '  • Resized variants:   image-300x200.jpg, image-1024x768.png',
    '  • WebP companions:    image.jpg.webp, image-300x200.jpg.webp',
    '    (WordPress 5.3+ generates these alongside every upload)',
    '  • Duplicate files:    same filename + size = same file',
    '',
  ].join('\n'));
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────
if (!existsSync(SRC_DIR)) {
  console.error(`\n❌ Source not found: ${SRC_DIR}`);
  console.error('Run --help for usage.');
  process.exit(1);
}

// Guard: destination already has files
if (!FLAG_DRYRUN && !FLAG_CLEAN && !FLAG_FORCE && existsSync(DEST_DIR)) {
  let existingCount = 0;
  try {
    for (const _ of walkDir(DEST_DIR)) { existingCount++; if (existingCount > 5) break; }
  } catch { /* ignore */ }

  if (existingCount > 0) {
    console.error('\n❌ Destination directory already contains files:');
    console.error(`   ${DEST_DIR}`);
    console.error('\n   Running again on the same destination creates duplicate');
    console.error('   .jpg AND .webp versions of the same image.\n');
    console.error('   Options:');
    console.error('     --clean   Delete dest/ and start fresh (recommended)');
    console.error('     --force   Skip this check and add files on top');
    console.error('     --dry-run Just count, do not copy');
    console.error('');
    process.exit(1);
  }
}

// --clean: delete destination first
if (FLAG_CLEAN && !FLAG_DRYRUN && existsSync(DEST_DIR)) {
  console.log(`\n🗑  --clean: removing ${DEST_DIR}...`);
  rmSync(DEST_DIR, { recursive: true, force: true });
  console.log('   Done.\n');
}

console.log('━'.repeat(62));
console.log('  WordPress → Waritaku CMS Image Migration Pipeline');
console.log('━'.repeat(62));
console.log(`\n  Source : ${SRC_DIR}`);
console.log(`  Dest   : ${DEST_DIR}`);
console.log(`  WebP   : ${FLAG_WEBP ? 'YES (convert originals)' : 'No (copy as-is)'}`);
console.log(`  Dry run: ${FLAG_DRYRUN ? 'YES' : 'No'}`);

if (FLAG_WEBP) {
  console.log('\n  ⚠  WebP conversion active — this can take 20-40 minutes for large libraries.');
}

console.log('\n📂 Scanning WordPress uploads...');

let sharp;
if (FLAG_WEBP) {
  try {
    sharp = (await import('sharp')).default;
    console.log('  ✓ sharp loaded for WebP conversion');
  } catch {
    console.error('  ❌ sharp not available. Run `npm install` first.');
    process.exit(1);
  }
}

// ── Pass 1: collect all files ─────────────────────────────────────────────────────────────────────────────────
const allFiles = [];
for (const filePath of walkDir(SRC_DIR)) {
  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext) || MEDIA_EXTS.has(ext)) {
    allFiles.push(filePath);
  }
}
console.log(`  Found : ${allFiles.length.toLocaleString()} media files total`);

// ── Pass 2: filter and copy ───────────────────────────────────────────────────────────────────────────────────
const urlMap       = {};
const sizeMap      = {}; // "size:name" → dest path (dedup heuristic)
const seen         = new Set();

let countSkippedResized = 0;
let countSkippedDup     = 0;
let countCopied         = 0;
let countConverted      = 0;
let countError          = 0;
let countMedia          = 0;
let bytesIn             = 0;
let bytesOut            = 0;

if (!FLAG_DRYRUN) ensureDir(DEST_DIR);

const startTime = Date.now();

for (let i = 0; i < allFiles.length; i++) {
  const filePath = allFiles[i];
  const relToSrc  = relative(SRC_DIR, filePath);   // e.g. "2020/01/image.jpg"
  const filename  = basename(filePath);
  const ext       = extname(filePath).toLowerCase();

  // Progress every 500 files
  if (i % 500 === 0 || i === allFiles.length - 1) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const pct = ((i + 1) / allFiles.length * 100).toFixed(0);
    process.stdout.write(`\r  [${String(i + 1).padStart(6)}/${allFiles.length}] ${pct}% — ${elapsed}s elapsed | copied:${countCopied} skipped:${countSkippedResized + countSkippedDup} err:${countError}  `);
  }

  // Skip ALL WordPress-generated derived files:
  //   Type A: image-300x200.jpg (resized)
  //   Type B: image.jpg.webp, image-300x200.jpg.webp (WebP companions, WordPress 5.3+)
  if (isWordPressGenerated(filePath, filename)) {
    countSkippedResized++;
    continue;
  }

  // Size-based dedup heuristic: same file size + same basename = likely duplicate
  let fileSize;
  try {
    fileSize = statSync(filePath).size;
  } catch {
    countError++;
    continue;
  }

  const dupKey = `${fileSize}:${filename}`;
  if (seen.has(dupKey)) {
    countSkippedDup++;
    // Still add to urlMap pointing to the first copy's destination
    if (sizeMap[dupKey]) {
      const wpUrl    = `/wp-content/uploads/${relToSrc.replace(/\\/g, '/')}`;
      urlMap[wpUrl]  = sizeMap[dupKey];
    }
    continue;
  }
  seen.add(dupKey);

  // Determine destination filename
  let destFilename = filename;
  if (FLAG_WEBP && CONVERT_EXTS.has(ext)) {
    destFilename = basename(filename, ext) + '.webp';
  }

  const destRelPath = join(dirname(relToSrc), destFilename);
  const destPath    = join(DEST_DIR, destRelPath);

  // Build URL map entry
  const wpUrl    = `/wp-content/uploads/${relToSrc.replace(/\\/g, '/')}`;
  const localUrl = `/uploads/${destRelPath.replace(/\\/g, '/')}`;
  urlMap[wpUrl]  = localUrl;
  sizeMap[dupKey] = localUrl;

  if (MEDIA_EXTS.has(ext)) countMedia++;

  if (FLAG_DRYRUN) {
    countCopied++;
    continue;
  }

  // Ensure dest directory exists
  ensureDir(dirname(destPath));

  try {
    if (FLAG_WEBP && sharp && CONVERT_EXTS.has(ext)) {
      // Convert to WebP
      await sharp(filePath)
        .webp({ quality: 82, effort: 4 })
        .toFile(destPath);
      const destSize = statSync(destPath).size;
      bytesIn  += fileSize;
      bytesOut += destSize;
      countConverted++;
    } else {
      // Direct copy
      copyFileSync(filePath, destPath);
      bytesIn  += fileSize;
      bytesOut += fileSize;
    }
    countCopied++;
  } catch (err) {
    countError++;
    // Fallback: try direct copy if WebP conversion failed
    if (FLAG_WEBP) {
      try {
        const fallbackDest = join(DEST_DIR, relToSrc);
        ensureDir(dirname(fallbackDest));
        copyFileSync(filePath, fallbackDest);
        const fbUrl = `/uploads/${relToSrc.replace(/\\/g, '/')}`;
        urlMap[wpUrl] = fbUrl;
        sizeMap[dupKey] = fbUrl;
        countCopied++;
        countError--;
      } catch { /* give up */ }
    }
  }
}

process.stdout.write('\n');

// ── Write URL map ─────────────────────────────────────────────────────────────────────────────────────
if (!FLAG_DRYRUN) {
  writeFileSync(URL_MAP_PATH, JSON.stringify(urlMap, null, 2), 'utf8');
}

// ── Summary ───────────────────────────────────────────────────────────────────────────────────────
const elapsed     = ((Date.now() - startTime) / 1000).toFixed(1);
const gbIn        = (bytesIn / 1024 / 1024 / 1024).toFixed(2);
const gbOut       = (bytesOut / 1024 / 1024 / 1024).toFixed(2);
const savings     = bytesIn > 0 ? (100 - (bytesOut / bytesIn * 100)).toFixed(1) : '0';

console.log('\n' + '━'.repeat(62));
console.log(`  ${FLAG_DRYRUN ? '🔍 Dry Run Complete' : '✅  Done!'}`);
console.log('━'.repeat(62));
console.log(`\n  ⏱  Time elapsed:  ${elapsed}s`);
console.log(`  📁 Total scanned: ${allFiles.length.toLocaleString()} files`);
console.log(`  ✓  Copied:        ${countCopied.toLocaleString()}`);
console.log(`  ↩  Skip (resize): ${countSkippedResized.toLocaleString()} WP resized variants`);
console.log(`  ↩  Skip (dedup):  ${countSkippedDup.toLocaleString()} duplicate files`);
if (FLAG_WEBP) {
  console.log(`  🔄 Converted:     ${countConverted.toLocaleString()} images to WebP`);
  if (!FLAG_DRYRUN) {
    console.log(`  📦 Size in:       ${gbIn} GB`);
    console.log(`  📦 Size out:      ${gbOut} GB  (${savings}% savings)`);
  }
}
if (countError > 0) console.log(`  ⚠  Errors:        ${countError}`);
if (!FLAG_DRYRUN) {
  console.log(`\n  🗺  URL map:      scripts/image_url_map.json  (${Object.keys(urlMap).length.toLocaleString()} entries)`);
  console.log(`  📂 Output dir:   ${DEST_DIR}`);
}
console.log('\n  🚀 Next: run node scripts/wp-import.mjs then upload import_payload.json');
console.log('━'.repeat(62) + '\n');
