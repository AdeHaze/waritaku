#!/usr/bin/env node
/**
 * R2 Render Cache Pre-Warmer
 *
 * Hits all published entry and category archive pages on production so the
 * middleware populates R2. After this runs, all public traffic is served
 * from R2 with zero D1 queries.
 *
 * Usage:
 *   node scripts/prewarm.mjs
 *   node scripts/prewarm.mjs --tags        # also warm all 10k+ tag pages
 *   node scripts/prewarm.mjs --dry-run     # print URLs without fetching
 *   node scripts/prewarm.mjs --concurrency=10
 *
 * Safe to run multiple times. Pages already in R2 return X-Cache: HIT and
 * are skipped without triggering any D1 query or re-render.
 *
 * Transient errors (503, 429, network failures) are retried automatically
 * with exponential backoff after the main pass completes.
 */

import { execSync } from 'node:child_process';

const ORIGIN      = 'https://waritaku.com';
const MAX_RETRIES = 4;          // attempts per URL after first failure
const RETRY_BASE  = 2000;       // ms — doubles each attempt (2s, 4s, 8s, 16s)

// Errors worth retrying (transient overload, not permanent failures)
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const WARM_TAGS   = args.includes('--tags');
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? '5', 10);
const DELAY_MS    = 150; // ms between batches

// ---------------------------------------------------------------------------

function queryLocal(sql) {
    try {
        const out = execSync(
            `npx wrangler d1 execute DB --local --json --command "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        // wrangler outputs non-JSON lines before the JSON array; find the array
        const jsonStart = out.indexOf('[');
        if (jsonStart === -1) return [];
        const parsed = JSON.parse(out.slice(jsonStart));
        return parsed[0]?.results ?? [];
    } catch (e) {
        console.error('DB query failed:', e.message);
        return [];
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchOnce(url) {
    try {
        const res = await fetch(url, {
            headers: {
                'Cache-Control': 'no-cache',
                'User-Agent': 'waritaku-prewarm/1.0',
            },
            redirect: 'follow',
        });
        const cacheStatus = res.headers.get('x-cache') ?? 'MISS';
        return { url, status: res.status, hit: cacheStatus === 'HIT', ok: res.ok };
    } catch (err) {
        // Network-level failure — treat as retryable
        return { url, status: 0, ok: false, hit: false, retryable: true, error: err.message };
    }
}

// Fetch with automatic exponential-backoff retry for transient errors.
async function warmUrl(url) {
    let result = await fetchOnce(url);
    if (result.ok || result.hit) return result;

    const isRetryable = result.retryable || RETRYABLE_STATUSES.has(result.status);
    if (!isRetryable) return result;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const wait = RETRY_BASE * Math.pow(2, attempt - 1);
        await sleep(wait);
        result = await fetchOnce(url);
        if (result.ok || result.hit) {
            result.retried = attempt;
            return result;
        }
        if (!RETRYABLE_STATUSES.has(result.status) && !result.retryable) break;
    }

    result.exhausted = true;
    return result;
}

// ---------------------------------------------------------------------------

async function main() {
    console.log('=== Waritaku R2 Pre-Warmer ===\n');

    // 1. Collect entry slugs
    process.stdout.write('Querying published entries... ');
    const entries = queryLocal("SELECT slug FROM entries WHERE status = 'published'");
    console.log(`${entries.length} found`);

    // 2. Collect category term slugs (omit_taxonomy_slug=1 → no prefix in URL)
        process.stdout.write('Querying category terms... ');
    const categories = queryLocal(`
        SELECT t.slug as term_slug, t.entry_count
        FROM terms t
        JOIN taxonomies tx ON tx.id = t.taxonomy_id
        WHERE tx.slug = 'categories' AND tx.is_routed = 1
    `);
    console.log(`${categories.length} found`);

    // 3. Optionally collect tag slugs
    let tags = [];
    if (WARM_TAGS) {
                process.stdout.write('Querying tag terms... ');
        tags = queryLocal(`
            SELECT t.slug as term_slug, t.entry_count
            FROM terms t
            JOIN taxonomies tx ON tx.id = t.taxonomy_id
            WHERE tx.slug = 'tag' AND tx.is_routed = 1
        `);
        console.log(`${tags.length} found`);
    }

    // 4. Build URL list
    const PAGE_SIZE = 12;
    const urls = [
        `${ORIGIN}/`,
        ...entries.map(e => `${ORIGIN}/${e.slug}`)
    ];

    // Categories and their pagination
    for (const c of categories) {
        urls.push(`${ORIGIN}/${c.term_slug}`);
        const totalPages = Math.ceil((c.entry_count || 0) / PAGE_SIZE);
        for (let p = 2; p <= totalPages; p++) {
            urls.push(`${ORIGIN}/${c.term_slug}/page/${p}`);
        }
    }

    // Tags and their pagination
    for (const t of tags) {
        urls.push(`${ORIGIN}/tag/${t.term_slug}`);
        const totalPages = Math.ceil((t.entry_count || 0) / PAGE_SIZE);
        for (let p = 2; p <= totalPages; p++) {
            urls.push(`${ORIGIN}/tag/${t.term_slug}/page/${p}`);
        }
    }

    console.log(`\nTotal URLs to warm: ${urls.length}`);
    if (DRY_RUN) {
        console.log('\n--- DRY RUN (first 20 URLs) ---');
        urls.slice(0, 20).forEach(u => console.log(' ', u));
        if (urls.length > 20) console.log(`  ... and ${urls.length - 20} more`);
        return;
    }
    console.log(`Concurrency: ${CONCURRENCY} | Retries: ${MAX_RETRIES} | Backoff: ${RETRY_BASE}ms base\n`);

    let done = 0, hits = 0, cached = 0, retried = 0, failed = 0;
    const failedUrls = [];
    const start = Date.now();

    for (let i = 0; i < urls.length; i += CONCURRENCY) {
        const batch = urls.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(warmUrl));

        for (const r of results) {
            done++;
            if (r.hit) {
                hits++;
            } else if (r.ok) {
                cached++;
                if (r.retried) retried++;
            } else {
                failed++;
                failedUrls.push(r);
                console.log(`\n  ✗ [${r.status}] ${r.url}${r.error ? ` — ${r.error}` : ''}${r.exhausted ? ' (retries exhausted)' : ''}`);
            }
        }

        const rate = (done / Math.max(1, Date.now() - start) * 1000).toFixed(1);
        const eta  = ((urls.length - done) / Math.max(0.1, parseFloat(rate))).toFixed(0);
        process.stdout.write(
            `\r  ${done}/${urls.length} | ${hits} cached | ${cached} newly warmed | ${failed} failed | ${rate} req/s | ETA ${eta}s   `
        );

        if (i + CONCURRENCY < urls.length) await sleep(DELAY_MS);
    }

    const totalSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\n=== Done in ${totalSec}s ===`);
    console.log(`  ${cached} pages newly cached in R2`);
    console.log(`  ${hits} pages already in R2 (skipped)`);
    if (retried)    console.log(`  ${retried} pages succeeded after retry`);
    if (failed > 0) {
        console.log(`  ${failed} pages permanently failed after ${MAX_RETRIES} retries:`);
        failedUrls.forEach(r => console.log(`    [${r.status}] ${r.url}`));
    } else {
        console.log('  0 permanent failures — full coverage achieved');
    }
    console.log('\nD1 reads will now drop to near zero for all public traffic.');
}

main().catch(err => {
    console.error('\nFatal:', err.message);
    process.exit(1);
});