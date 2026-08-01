#!/usr/bin/env node
/**
 * WordPress → Waritaku CMS Offline Import Parser  v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads a WordPress MySQL dump (.sql) and produces:
 *   scripts/import_payload.json  — upload this in /admin/system
 *   scripts/migration_report.json — quality audit (missing images, shortcodes…)
 *
 * Usage:
 *   node scripts/wp-import.mjs [path/to/dump.sql]
 *
 * Defaults to: ../../waritaku.old/u637737143_nOzYvIanNOaEnU.sql
 *              (sibling directory when run from waritaku-import-tester/)
 *
 * Decisions applied:
 *   - Passwords: WordPress hashes ($wp$2y$ = bcrypt, $P$ = phpass) imported as-is.
 *     The CMS login verifies bcrypt automatically. $P$ users need a password reset.
 *   - Images: wp-content/uploads/ URLs rewritten to /uploads/ for local serving.
 *     Run wp-import-images.mjs first to copy the actual image files.
 *   - Internal links: absolute https://[siteurl]/... rewritten to relative /...
 *   - Status: publish→published, draft/pending→draft, all others skipped.
 *   - Post types: post→articles, page→pages, attachment used for image resolution.
 *   - Shortcodes: [caption]→<figure>, [gallery]→<figure> grid, [embed]→iframe,
 *                 [video]/[audio]→HTML5 tags. Unknown shortcodes flagged in report.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const FLAG_HELP = args.includes('--help') || args.includes('-h');

let oldDomainArg = '';
const oldDomainIdx = args.indexOf('--old-domain');
if (oldDomainIdx !== -1 && args[oldDomainIdx + 1]) {
  oldDomainArg = args[oldDomainIdx + 1];
}

const posArgs = args.filter(a => !a.startsWith('--'));

const SQL_PATH = posArgs[0]
  ? resolve(process.cwd(), posArgs[0])
  : resolve(__dirname, '..', '..', 'waritaku.old', 'u637737143_nOzYvIanNOaEnU.sql');

const OUTPUT_PATH = resolve(__dirname, 'import_payload.json');
const REPORT_PATH = resolve(__dirname, 'migration_report.json');
const URL_MAP_PATH = resolve(__dirname, 'image_url_map.json');

let imageMap = {};
if (existsSync(URL_MAP_PATH)) {
  try {
    imageMap = JSON.parse(readFileSync(URL_MAP_PATH, 'utf8'));
    console.log(`✓ Loaded URL Map: ${URL_MAP_PATH}`);
  } catch {
    console.log(`⚠ Found URL Map but failed to parse: ${URL_MAP_PATH}`);
  }
}

if (FLAG_HELP) {
  console.log([
    '',
    'WordPress → Waritaku CMS  Offline Import Parser  v2.1',
    '',
    'Usage:',
    '  node scripts/wp-import.mjs [path/to/dump.sql] [flags]',
    '',
    'Flags:',
    '  --old-domain <domains>   Explicit old domain(s) to rewrite (comma-separated).',
    '                           Example: --old-domain fuyukaiblog.files.wordpress.com,oldblog.com',
    '  --help                   Show this help message.',
    '',
    'Features:',
    '  • Auto-scans SQL dump for ALL domains containing /wp-content/uploads',
    '  • Handles dead / archived websites without needing live domain access',
    '  • Converts [caption], [gallery], [embed], [video], [audio] shortcodes',
    '  • Generates import_payload.json & migration_report.json',
    '',
  ].join('\n'));
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// MySQL INSERT VALUES State-Machine Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses all row tuples from a MySQL INSERT VALUES text block.
 * Correctly handles: NULL, integers, single-quoted strings with
 * \n \t \r \0 \\ \' and '' (double-single-quote) escape sequences.
 *
 * @param {string} text - The raw VALUES portion of an INSERT statement
 * @returns {Array<Array<string|number|null>>}
 */
function parseInsertValues(text) {
  const rows = [];
  let i = 0;
  const n = text.length;

  function skipWS() {
    while (i < n && ' \t\r\n'.includes(text[i])) i++;
  }

  function readValue() {
    skipWS();
    if (i >= n) return undefined;

    // NULL literal
    if (text[i] === 'N' && text.slice(i, i + 4) === 'NULL') {
      i += 4;
      return null;
    }

    // Single-quoted string
    if (text[i] === "'") {
      i++; // skip opening quote
      let s = '';
      while (i < n) {
        const c = text[i];
        if (c === '\\') {
          i++;
          const e = text[i] ?? '';
          switch (e) {
            case 'n':  s += '\n'; break;
            case 't':  s += '\t'; break;
            case 'r':  s += '\r'; break;
            case '0':  s += '\0'; break;
            default:   s += e;   break;
          }
          i++;
        } else if (c === "'") {
          if (text[i + 1] === "'") { // escaped '' → '
            s += "'";
            i += 2;
          } else {
            i++; // closing quote
            break;
          }
        } else {
          s += c;
          i++;
        }
      }
      return s;
    }

    // Number or unquoted literal (e.g. 0, -1, 3.14)
    let v = '';
    while (i < n && text[i] !== ',' && text[i] !== ')') {
      v += text[i++];
    }
    v = v.trim();
    if (v === '') return null;
    const num = Number(v);
    return isNaN(num) ? v : num;
  }

  // Outer loop: find each ( ... ) tuple
  while (i < n) {
    skipWS();
    if (i >= n) break;

    if (text[i] === '(') {
      i++; // skip opening (
      const row = [];
      while (i < n) {
        skipWS();
        if (text[i] === ')') { i++; rows.push(row); break; }
        if (text[i] === ',') { i++; continue; }
        const val = readValue();
        if (val !== undefined) row.push(val);
      }
    } else if (text[i] === ',') {
      i++;
    } else {
      i++;
    }
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHP Serialized Capabilities Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract WordPress capability names set to true from a PHP serialized string.
 * Handles format: a:1:{s:K:"rolename";b:1;}
 * @param {string} serial
 * @returns {string[]}
 */
function parsePhpCapabilities(serial) {
  try {
    const matches = [...String(serial).matchAll(/s:\d+:"([^"]+)";b:1/g)];
    return matches.map(m => m[1]);
  } catch {
    return [];
  }
}

const WP_ROLE_MAP = {
  administrator: 'admin',
  editor:        'editor',
  author:        'author',
  contributor:   'contributor',
  subscriber:    'user',
};

function wpRoleToWaritaku(wpRole) {
  return WP_ROLE_MAP[wpRole] || 'user';
}

// ─────────────────────────────────────────────────────────────────────────────
// Content Transformations & Sanitization
// ─────────────────────────────────────────────────────────────────────────────

/** Sanitize alien unicode characters and non-breaking spaces */
function sanitizeAlien(text) {
  if (text == null) return '';
  let s = String(text).normalize('NFKC').replace(/\xa0/g, ' ');
  // Strip zero-width spaces, text direction marks, BOM, soft hyphens
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g, '');
  // Collapse spaces
  s = s.replace(/ +/g, ' ');
  return s.trim();
}

/** Sanitize slug: strip alien chars, trim hyphens, collapse double hyphens */
function sanitizeSlug(slug) {
  if (slug == null) return '';
  let s = slug;
  try { s = decodeURIComponent(slug); } catch (e) {} // WordPress url-encodes slugs
  s = sanitizeAlien(s);
  s = s.replace(/[・！？]/g, '-');
  // Allow alphanumeric, spaces, hyphens, and Japanese characters
  s = s.replace(/[^\w\s\-\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '');
  s = s.replace(/\s+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  return s.toLowerCase();
}

/** WordPress Auto-P (wpautop) port: wrap double newlines in <p> tags */
function wpautop(text) {
  if (!text || !text.trim()) return text;
  
  let pee = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  pee = pee.replace(/\n\n+/g, '\n\n');
  
  const paragraphs = pee.split('\n\n');
  let out = '';
  
  const blockRegex = /^(<(?:p|div|h[1-6]|ul|ol|li|figure|blockquote|table|pre|details|iframe|script|style)|\s*<)/i;
  
  for (let p of paragraphs) {
    p = p.trim();
    if (!p) continue;
    
    if (blockRegex.test(p) || p.startsWith('<!--') || p.startsWith('[')) {
      out += p + '\n\n';
    } else {
      const p_br = p.replace(/\n/g, '<br />');
      out += `<p>${p_br}</p>\n\n`;
    }
  }
  return out.trim();
}

/** Decode HTML entities in short text fields (taxonomy names, descriptions). */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g,  '<')
    .replace(/&gt;/g,  '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Rewrite WordPress upload URLs and internal links to relative paths.
 * Supports multiple old domains (auto-detected + explicit --old-domain).
 * Uses imageMap if available to map exact URLs (for .webp and deduping).
 *
 * @param {string} html
 * @param {string} siteUrl - e.g. 'https://waritaku.com'
 * @param {Set<string>} extraDomains
 * @returns {string}
 */
function rewriteUrls(html, siteUrl, extraDomains = new Set()) {
  const domainsToRewrite = new Set(extraDomains);

  if (siteUrl) {
    const d = siteUrl.replace(/https?:\/\//i, '').replace(/\/$/, '');
    if (d) domainsToRewrite.add(d);
  }

  if (oldDomainArg) {
    for (const d of oldDomainArg.split(',')) {
      const cleaned = d.trim().replace(/https?:\/\//i, '').replace(/\/$/, '');
      if (cleaned) domainsToRewrite.add(cleaned);
    }
  }

  // Strip Jetpack CDN prefixes (e.g. i0.wp.com/Waritaku.com)
  html = html.replace(/https?:\/\/i\d\.wp\.com\/[^\/]+/gi, '');

  // 0. Exact mappings using imageMap
  // imageMap keys are like: /wp-content/uploads/2020/01/image.jpg
  html = html.replace(/(https?:\/\/[^/]+)?(\/wp-content\/uploads\/[^"'\s<>]+)/gi, (match, domain, fullPath) => {
    // 1. Exact match
    if (imageMap[fullPath]) {
      return imageMap[fullPath];
    }
    // 2. Try matching without query strings
    const cleanPath = fullPath.split('?')[0];
    if (imageMap[cleanPath]) {
      return imageMap[cleanPath];
    }
    return match;
  });

  for (const domain of domainsToRewrite) {
    const escaped = domain.replace(/\./g, '\\.');

    // 1. Fallback: Rewrite wp-content/uploads/ paths to /uploads/
    html = html.replace(
      new RegExp(`https?://${escaped}/wp-content/uploads/`, 'gi'),
      '/uploads/'
    );

    // 2. Rewrite internal links (href/src) to relative, skipping /wp-admin, /wp-content, /wp-includes
    html = html.replace(
      new RegExp(`(href|src)=["'](https?://${escaped})/((?!wp-admin|wp-content|wp-includes|wp-json)[^"'\\s]*)(["'])`, 'gi'),
      (_m, attr, _base, path, quote) => `${attr}="/${path}${quote}`
    );
  }

  // 3. Final Catch-all: Rewrite any remaining protocol-less or absolute wp-content/uploads paths
  html = html.replace(/(?:https?:)?(?:\/\/[^\/]+)?\/?wp-content\/uploads\//gi, '/uploads/');

  return html;
}

/**
 * Build a YouTube embed iframe from a video URL.
 * Handles: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
 */
function youtubeEmbed(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (!m) return null;
  return `<div class="wp-embed-responsive"><iframe loading="lazy" src="https://www.youtube.com/embed/${m[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="YouTube video"></iframe></div>`;
}

/** Build a Vimeo embed iframe. */
function vimeoEmbed(url) {
  const m = url.match(/vimeo\.com\/(\d+)/);
  if (!m) return null;
  return `<div class="wp-embed-responsive"><iframe loading="lazy" src="https://player.vimeo.com/video/${m[1]}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
}

/**
 * Transform a [gallery ids="..."] shortcode into a <figure> grid.
 * @param {string} attrs - raw shortcode attributes string
 * @param {Record<number, string>} attachmentUrlById - attachment post_id → URL
 * @param {string} siteUrl
 * @returns {string}
 */
function transformGallery(attrs, attachmentUrlById, siteUrl) {
  const idsMatch     = attrs.match(/ids=["']([^"']+)["']/);
  const columnsMatch = attrs.match(/columns=["']?(\d+)["']?/);
  const columns      = columnsMatch ? parseInt(columnsMatch[1]) : 3;

  let ids = [];
  if (idsMatch) {
    ids = idsMatch[1].split(',').map(s => parseInt(s.trim())).filter(Boolean);
  }

  if (ids.length === 0) return '<!-- wp:gallery (no ids resolved) -->';

  const items = ids
    .map(id => {
      let url = attachmentUrlById[id];
      if (!url) return '';
      // Rewrite URL if it's a full WordPress URL
      url = rewriteUrls(`<img src="${url}" loading="lazy" />`, siteUrl);
      return `<figure class="gallery-item">${url}</figure>`;
    })
    .filter(Boolean);

  if (items.length === 0) return '';
  return `<div class="wp-gallery wp-gallery-columns-${columns}">${items.join('')}</div>`;
}

/**
 * Known shortcodes and their order of resolution.
 * Any shortcode not in this set is flagged in the migration report.
 */
const KNOWN_SHORTCODES = new Set([
  'caption', 'gallery', 'embed', 'video', 'audio', 'playlist',
  // Common plugin shortcodes that we strip cleanly:
  'wp_caption',
]);

// Tracks unknown shortcodes per article: Map<articleId, Set<string>>
const unknownShortcodesByArticle = new Map();

/**
 * Full content transformation pipeline.
 *
 * @param {string} content        - raw WordPress post_content
 * @param {number} postId         - for migration report tracking
 * @param {Record<number,string>} attachmentUrlById
 * @param {string} siteUrl        - e.g. 'https://waritaku.com'
 * @returns {string}
 */
function transformContent(content, postId = 0, attachmentUrlById = {}, siteUrl = '') {
  if (!content) return '';
  let html = String(content);

  // 1. Strip Gutenberg block comments (<!-- wp:... --> and <!-- /wp:... -->)
  html = html.replace(/<!--\s*wp:[^\n]*?-->/g, '');
  html = html.replace(/<!--\s*\/wp:[\w\/\-]+\s*-->/g, '');

  // 2. [caption ...] → <figure><figcaption>
  html = html.replace(
    /\[(?:wp_)?caption([^\]]*)\]([\s\S]*?)\[\/(?:wp_)?caption\]/gi,
    (_match, attrs, inner) => {
      const alignMatch = attrs.match(/align=["']?([\w]+)["']?/);
      const alignClass = alignMatch ? ` ${alignMatch[1]}` : '';
      const elemMatch  = inner.match(/^([\s\S]*?(?:<\/a>|<img[^>]*\/?>))\s*([\s\S]*)$/i);
      if (elemMatch) {
        const imgPart     = elemMatch[1].trim();
        const captionText = elemMatch[2].trim();
        return captionText
          ? `<figure class="wp-caption${alignClass}">${imgPart}<figcaption>${captionText}</figcaption></figure>`
          : `<figure class="wp-caption${alignClass}">${imgPart}</figure>`;
      }
      return inner;
    }
  );

  // 3. [gallery ids="..."] → figure grid
  html = html.replace(
    /\[gallery([^\]]*)\]/gi,
    (_match, attrs) => transformGallery(attrs, attachmentUrlById, siteUrl)
  );

  // 4. [embed ...] URL [/embed] → Raw URL (so Tiptap doesn't strip iframes)
  html = html.replace(
    /\[embed[^\]]*\]\s*(https?:\/\/[^\s<\[]+)\s*\[\/embed\]/gi,
    (_match, url) => `<p>${url}</p>`
  );

  // 5. Removed: Bare YouTube / Vimeo URLs are left as-is so Tiptap preserves them.

  // 6. [video mp4="..."] → <video>
  html = html.replace(
    /\[video([^\]]*)\]/gi,
    (_match, attrs) => {
      const mp4   = (attrs.match(/mp4=["']([^"']+)["']/)  || [])[1]  || '';
      const webm  = (attrs.match(/webm=["']([^"']+)["']/) || [])[1] || '';
      const ogg   = (attrs.match(/ogv=["']([^"']+)["']/)  || [])[1]  || '';
      const poster = (attrs.match(/poster=["']([^"']+)["']/) || [])[1] || '';
      if (!mp4 && !webm) return '';
      const srcs = [
        mp4  ? `<source src="${mp4}" type="video/mp4">`  : '',
        webm ? `<source src="${webm}" type="video/webm">` : '',
        ogg  ? `<source src="${ogg}" type="video/ogg">`  : '',
      ].join('');
      return `<video controls preload="metadata" ${poster ? `poster="${poster}"` : ''} style="max-width:100%">${srcs}</video>`;
    }
  );
  html = html.replace(/\[\/video\]/gi, '');

  // 7. [audio mp3="..."] → <audio>
  html = html.replace(
    /\[audio([^\]]*)\]/gi,
    (_match, attrs) => {
      const mp3 = (attrs.match(/mp3=["']([^"']+)["']/) || [])[1] || '';
      const ogg = (attrs.match(/ogg=["']([^"']+)["']/) || [])[1] || '';
      if (!mp3 && !ogg) return '';
      const srcs = [
        mp3 ? `<source src="${mp3}" type="audio/mpeg">` : '',
        ogg ? `<source src="${ogg}" type="audio/ogg">`  : '',
      ].join('');
      return `<audio controls preload="metadata" style="width:100%">${srcs}</audio>`;
    }
  );
  html = html.replace(/\[\/audio\]/gi, '');

  // 8. [playlist] → strip cleanly (complex to convert, flag in report)
  html = html.replace(/\[playlist[^\]]*\]/gi, '<!-- playlist shortcode removed -->');

  // 9. Detect remaining unresolved shortcodes and flag in migration report
  const remainingShortcodes = [...html.matchAll(/\[([a-zA-Z][a-zA-Z0-9_-]*)(?:[^\]]*)?\]/g)]
    .map(m => m[1].toLowerCase())
    .filter(name => !KNOWN_SHORTCODES.has(name));

  if (remainingShortcodes.length > 0 && postId) {
    const unique = [...new Set(remainingShortcodes)];
    unknownShortcodesByArticle.set(postId,
      [...(unknownShortcodesByArticle.get(postId) || []), ...unique]
    );
  }

  // 10. Rewrite wp-content/uploads URLs → /uploads/ and internal domain links → relative
  html = rewriteUrls(html, siteUrl, extraDomains);

  // 11. Alien unicode sanitization
  html = sanitizeAlien(html);

  // 12. WordPress Auto-Paragraph (<p> wrapping)
  html = wpautop(html);

  return html.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

if (!existsSync(SQL_PATH)) {
  console.error(`\n❌ SQL file not found:\n   ${SQL_PATH}`);
  console.error('\nUsage: node scripts/wp-import.mjs [path/to/dump.sql]\n');
  process.exit(1);
}

console.log('━'.repeat(60));
console.log('  WordPress → Waritaku CMS Import Parser');
console.log('━'.repeat(60));
console.log(`\n📖 Reading: ${SQL_PATH}`);

const sql = readFileSync(SQL_PATH, { encoding: 'utf8' });
console.log(`✓  Loaded:  ${(sql.length / 1024 / 1024).toFixed(1)} MB\n`);

// ─── Extract INSERT blocks via line-by-line scan ──────────────────────────

const TABLES_WE_WANT = new Set([
  'wp_users',
  'wp_options',     // needed to extract siteurl (makes pipeline generalized)
  'wp_terms',
  'wp_term_taxonomy',
  'wp_term_relationships',
  'wp_posts',
  'wp_postmeta',
  'wp_usermeta',
]);

/** @type {Record<string, Array<Array<any>>>} */
const rawData = Object.fromEntries([...TABLES_WE_WANT].map(t => [t, []]));

console.log('🔍 Parsing INSERT statements...');

const lines = sql.split('\n');
let inInsert = null;  // current table name we're collecting
const bufLines = [];   // lines accumulated for this INSERT block

for (let li = 0; li < lines.length; li++) {
  const trimLine = lines[li].trimEnd();

  if (inInsert) {
    bufLines.push(trimLine);
    // A row ends with ); = end of the full INSERT statement
    if (trimLine.endsWith(');')) {
      const rows = parseInsertValues(bufLines.join('\n'));
      rawData[inInsert].push(...rows);
      process.stdout.write(`   ${inInsert}: ${rawData[inInsert].length} rows total\n`);
      inInsert = null;
      bufLines.length = 0;
    }
  } else {
    // Detect start of INSERT INTO `tablename` VALUES
    const m = trimLine.match(/^INSERT INTO `(\w+)` VALUES$/);
    if (m && TABLES_WE_WANT.has(m[1])) {
      inInsert = m[1];
      bufLines.length = 0;
    }
  }
}

// ─── Extract site URL from wp_options ─────────────────────────────────────
let siteUrl = '';
for (const row of rawData.wp_options || []) {
  if (row[1] === 'siteurl') {
    siteUrl = String(row[2] || '').replace(/\/$/, ''); // strip trailing slash
    break;
  }
}
console.log(`   Site URL: ${siteUrl || '(not found — using auto-detected domains)'}`);

const extraDomains = new Set();
if (oldDomainArg) {
  for (const d of oldDomainArg.split(',')) {
    const cleaned = d.trim().replace(/https?:\/\//i, '').replace(/\/$/, '');
    if (cleaned) extraDomains.add(cleaned);
  }
  console.log(`   Explicit Old Domains to rewrite: ${[...extraDomains].join(', ')}`);
}

// ─── Build lookup structures ───────────────────────────────────────────────

// wp_usermeta: (umeta_id[0], user_id[1], meta_key[2], meta_value[3])
console.log('\n👥 Processing users & roles...');
const userCapabilities = {}; // userId → [roleName, ...]
for (const row of rawData.wp_usermeta) {
  const userId = row[1];
  const metaKey = String(row[2] || '');
  const metaValue = row[3];
  // WordPress uses both 'wp_capabilities' and '{db_prefix}_capabilities'
  if (metaKey.endsWith('_capabilities') || metaKey === 'wp_capabilities') {
    userCapabilities[userId] = parsePhpCapabilities(metaValue);
  }
}

// wp_users: (ID[0], user_login[1], user_pass[2], user_nicename[3], user_email[4],
//            user_url[5], user_registered[6], user_activation_key[7], user_status[8], display_name[9])
const users = rawData.wp_users.map(row => {
  const id = Number(row[0]);
  const caps = userCapabilities[id] || [];
  const wpRole = caps[0] || 'subscriber';
  let rawSlug = String(row[3] || row[1] || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const slug = sanitizeSlug(rawSlug);
  const registeredRaw = row[6];

  let createdAt;
  try {
    createdAt = registeredRaw ? new Date(String(registeredRaw) + ' UTC').toISOString() : new Date().toISOString();
  } catch {
    createdAt = new Date().toISOString();
  }

  return {
    id,
    name:         sanitizeAlien(row[9] || row[1] || ''),
    slug,
    email:        String(row[4] || ''),
    passwordHash: String(row[2] || ''),
    role:         wpRoleToWaritaku(wpRole),
    createdAt,
  };
});
console.log(`   → ${users.length} users`);

// ─── Terms: categories & tags ─────────────────────────────────────────────

// wp_terms: (term_id[0], name[1], slug[2], term_group[3], ...)
const termsById = {};
for (const row of rawData.wp_terms) {
  termsById[row[0]] = { name: sanitizeAlien(decodeHtmlEntities(row[1])), slug: sanitizeSlug(row[2]) };
}

// wp_term_taxonomy: (term_taxonomy_id[0], term_id[1], taxonomy[2], description[3], parent[4], count[5])
const termTaxById = {}; // term_taxonomy_id → { termId, taxonomy, description, parent }
for (const row of rawData.wp_term_taxonomy) {
  termTaxById[row[0]] = {
    termId:      row[1],
    taxonomy:    row[2],
    description: decodeHtmlEntities(row[3]),
    parent:      row[4],
  };
}

console.log('\n📂 Processing taxonomies (categories, tags, custom)...');
const dynamicTaxonomies = {}; // taxonomy_slug -> [term, term...]
const taxIdToUnified = {};    // term_taxonomy_id -> { taxonomy, termId }

for (const [taxId, { termId, taxonomy, description, parent }] of Object.entries(termTaxById)) {
  const term = termsById[termId];
  if (!term) continue;
  if (taxonomy === 'nav_menu') continue; // Skip navigation menus

  if (!dynamicTaxonomies[taxonomy]) dynamicTaxonomies[taxonomy] = [];
  dynamicTaxonomies[taxonomy].push({
    id:          Number(termId),
    name:        term.name,
    slug:        term.slug,
    description: description || '',
    parentId:    Number(parent) || null,
  });
  taxIdToUnified[taxId] = { taxonomy, termId: Number(termId) };
}

for (const tax of Object.keys(dynamicTaxonomies)) {
  console.log(`   → ${dynamicTaxonomies[tax].length} terms in '${tax}'`);
}

// ─── Term relationships ───────────────────────────────────────────────────

// wp_term_relationships: (object_id[0], term_taxonomy_id[1], term_order[2])
const postUnifiedTermIds = {}; // post_id → array of termId
const term_relationships = []; // Unified relationship array: { entryId, termId, taxonomy }

for (const row of rawData.wp_term_relationships) {
  const postId = row[0];
  const taxId  = row[1];
  const info   = taxIdToUnified[taxId];
  if (info) {
    (postUnifiedTermIds[postId] = postUnifiedTermIds[postId] || []).push(info.termId);
    term_relationships.push({ entryId: Number(postId), termId: info.termId, taxonomy: info.taxonomy });
  }
}

// ─── Postmeta ─────────────────────────────────────────────────────────────

// wp_postmeta: (meta_id[0], post_id[1], meta_key[2], meta_value[3])
const postMetaByPostId = {}; // post_id → { meta_key: meta_value }
for (const row of rawData.wp_postmeta) {
  const postId = row[1];
  if (!postMetaByPostId[postId]) postMetaByPostId[postId] = {};
  postMetaByPostId[postId][row[2]] = row[3];
}

// ─── Attachment URL map (for featured images) ─────────────────────────────

// Attachments = wp_posts rows where post_type='attachment', guid = image URL
const attachmentUrlById = {}; // attachment post_id → image URL
for (const row of rawData.wp_posts) {
  if (row[20] === 'attachment' && row[18]) {
    attachmentUrlById[Number(row[0])] = String(row[18]);
  }
}

// ─── Articles & Pages ────────────────────────────────────────────────────

/**
 * wp_posts column indices (standard WordPress schema):
 *  0  = ID
 *  1  = post_author
 *  2  = post_date        (local timezone)
 *  3  = post_date_gmt    (UTC)
 *  4  = post_content
 *  5  = post_title
 *  6  = post_excerpt
 *  7  = post_status
 *  8  = comment_status
 *  9  = ping_status
 * 10  = post_password
 * 11  = post_name   (slug)
 * 12  = to_ping
 * 13  = pinged
 * 14  = post_modified
 * 15  = post_modified_gmt
 * 16  = post_content_filtered
 * 17  = post_parent
 * 18  = guid
 * 19  = menu_order
 * 20  = post_type
 * 21  = post_mime_type
 * 22  = comment_count
 */

console.log('\n📝 Processing posts, pages, and custom post types...');
const dynamicCollections = {}; // post_type -> [entry, entry...]

for (const row of rawData.wp_posts) {
  const id        = Number(row[0]);
  const postType  = row[20];
  const postStatus = row[7];

  // Ignore internal/hidden types and plugin bloat
  const ignoredTypes = new Set([
    'attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset', 'oembed_cache',
    'wp_block', 'acf-field', 'acf-field-group', 'wp_template', 'wp_template_part', 'wp_global_styles',
    'wp_navigation', 'elementor_library', 'seedprod', 'popup', 'popup_theme', 'um_form', 'um_directory',
    'um_role', 'wpforms', 'user_request'
  ]);
  if (ignoredTypes.has(postType)) continue;

  // Map WordPress core post types to Waritaku default collections
  let targetCollection = postType;
  if (postType === 'post') targetCollection = 'articles';
  if (postType === 'page') targetCollection = 'pages';

  // Status mapping
  let status;
  if (postStatus === 'publish') {
    status = 'published';
  } else if (postStatus === 'draft' || postStatus === 'pending') {
    status = 'draft';
  } else {
    continue; // skip trash, auto-draft, private, inherit, etc.
  }

  const authorId    = Number(row[1]) || null;
  const postDateGmt = row[3];  // use GMT date for accurate publishedAt
  const content     = transformContent(row[4], id, attachmentUrlById, siteUrl);
  const title       = sanitizeAlien(decodeHtmlEntities(row[5]) || '');
  const slug        = sanitizeSlug(row[11] || '');
  const password    = row[10] ? String(row[10]) : null;

  // Featured image via _thumbnail_id → attachment guid, then rewrite URL
  const meta = postMetaByPostId[id] || {};
  let featuredImageUrl = null;
  const thumbnailId = meta['_thumbnail_id'];
  if (thumbnailId) {
    let rawFeatUrl = attachmentUrlById[Number(thumbnailId)] || null;
    if (rawFeatUrl) {
      rawFeatUrl = rewriteUrls(rawFeatUrl, siteUrl, extraDomains);
    }
    featuredImageUrl = rawFeatUrl;
  }

  // SEO meta (RankMath first, Yoast fallback)
  let metaTitle = meta['rank_math_title'] || meta['_yoast_wpseo_title'] || null;
  if (metaTitle && /^(?:%[a-zA-Z0-9_-]+%|\||-|\s)+$/i.test(metaTitle)) {
    metaTitle = null; // Ignore default templates so frontend fallback works
  }
  const metaDescription = meta['rank_math_description'] || meta['_yoast_wpseo_metadesc'] || null;

  // Published date (always use GMT for correct UTC ISO string)
  let publishedAt = null;
  if (postDateGmt && String(postDateGmt) !== '0000-00-00 00:00:00') {
    try {
      publishedAt = new Date(String(postDateGmt) + ' UTC').toISOString();
    } catch {
      publishedAt = null;
    }
  }

  // Terms
  const termIds = postUnifiedTermIds[id] || [];

  const entry = {
    id,
    title,
    slug,
    content,
    authorId,
    status,
    visibility: password ? 'password' : 'public',
    password,
    publishedAt,
    featuredImageUrl,
    metaTitle:       metaTitle ? String(metaTitle) : null,
    metaDescription: metaDescription ? String(metaDescription) : null,
  };

  if (!dynamicCollections[targetCollection]) dynamicCollections[targetCollection] = [];
  dynamicCollections[targetCollection].push(entry);
}

for (const coll of Object.keys(dynamicCollections)) {
  console.log(`   → ${dynamicCollections[coll].length} entries in '${coll}'`);
}
console.log(`   → ${term_relationships.length} term relationships mapped`);
console.log(`   → ${unknownShortcodesByArticle.size} entries with unresolved shortcodes`);

// ─── Assemble & write payload ──────────────────────────────────────────────

const payload = {
  version:   '2.0', // Upgraded to v2.0 for dynamic collections/taxonomies
  generated: new Date().toISOString(),
  source:    SQL_PATH,
  stats: {
    users:              users.length,
    taxonomies:         Object.keys(dynamicTaxonomies).length,
    collections:        Object.keys(dynamicCollections).length,
    term_relationships: term_relationships.length,
  },
  users,
  taxonomies: dynamicTaxonomies,
  collections: dynamicCollections,
  term_relationships,
};

// ─── Migration report ─────────────────────────────────────────────────────

const allEntries = Object.values(dynamicCollections).flat();

const noFeaturedImage = allEntries
  .filter(a => a.status === 'published' && !a.featuredImageUrl)
  .map(a => ({ id: a.id, title: a.title, slug: a.slug }));

const shortcodeIssues = [...unknownShortcodesByArticle.entries()].map(([id, codes]) => {
  const a = allEntries.find(x => x.id === id);
  return { id, title: a?.title || '', slug: a?.slug || '', shortcodes: [...new Set(codes)] };
});

const phpassUsers = users.filter(u =>
  u.passwordHash.startsWith('$P$') || u.passwordHash.startsWith('$H$')
);

const report = {
  generated:        new Date().toISOString(),
  siteUrl,
  summary: {
    totalEntries:           allEntries.length,
    entriesNoFeaturedImage: noFeaturedImage.length,
    entriesWithUnknownShortcodes: shortcodeIssues.length,
    phpassUsersNeedReset:   phpassUsers.length,
  },
  noFeaturedImage,
  shortcodeIssues,
  phpassUsersNeedReset: phpassUsers.map(u => ({ id: u.id, name: u.name, email: u.email })),
};

console.log('\n💾 Writing import_payload.json...');
writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
const outSize = (JSON.stringify(payload).length / 1024).toFixed(1);

console.log('📋 Writing migration_report.json...');
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

console.log('\n' + '━'.repeat(60));
console.log('  ✅  Done!');
console.log('━'.repeat(60));
console.log(`\n  Payload:    ${OUTPUT_PATH}`);
console.log(`  Report:     ${REPORT_PATH}`);
console.log(`  Size:       ${outSize} KB\n`);
console.log('  📊 Stats:');
console.log(`     Site URL:              ${siteUrl || '(not found in wp_options)'}`);
console.log(`     Users:                 ${users.length}`);
console.log(`     Taxonomies Extracted:  ${Object.keys(dynamicTaxonomies).length}`);
console.log(`     Collections Extracted: ${Object.keys(dynamicCollections).length}`);
console.log(`     Term Relationships:    ${term_relationships.length}`);
console.log('\n  ⚠  Migration Report:');
console.log(`     Missing featured img:  ${noFeaturedImage.length}`);
console.log(`     Unknown shortcodes:    ${shortcodeIssues.length} articles`);
console.log(`     phpass users (reset!): ${phpassUsers.length}`);
console.log('\n  🚀 Next steps:');
console.log('     1. node scripts/wp-import-images.mjs');
console.log('     2. Upload import_payload.json via /admin/system → WordPress Import');
console.log('     3. Review /admin/migration-report for cleanup tasks');
console.log('━'.repeat(60) + '\n');
