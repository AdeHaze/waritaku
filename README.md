# Waritaku CMS

Waritaku CMS is a modern, headless content management system built with Astro, Cloudflare D1, and Cloudflare R2. It is designed to replace WordPress for multi-site, multi-content-type workloads — the same engine can power a news site, a product catalog, or a WooCommerce-style store without schema changes.

## Overview

The system uses Astro for server-side rendering, React for dynamic admin interfaces, Drizzle ORM for database operations, and Cloudflare infrastructure for database and object storage. Content is modeled with an **EAV / JSON-schema driven** design: content types (`collections`) are defined in the database as JSON schemas, and every entry's custom fields live in a flexible JSON `data` column. New content types and fields require **zero schema migrations**.

## System Architecture & Features

- **Headless EAV Data Model**: `collections` (content types with JSON field schemas), `entries` (content with JSON `data` column; status: draft / published / scheduled / trashed), `taxonomies` + `terms` + `entry_terms` (classification with routing + prefix options), `entry_revisions` (full snapshot history for rollback), `settings` (key-value store), `redirects` / `notFoundLogs` (301 engine + 404 tracking).
- **Database Environments**: Miniflare for local development (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`), Cloudflare D1 staging for remote testing (`npm run dev --remote`), and Cloudflare D1 for production.
- **Adapter Pattern**: Decoupled architecture using `src/lib/db.ts` (database adapter) and `src/lib/storage.ts` (storage adapter) to prevent vendor lock-in. Swap D1→PostgreSQL or R2→S3 by editing one file.
- **Media Uploads**: Local development uploads save to `/local_uploads` via a custom Vite plugin (with `.webp` fallback). Production uploads send files directly to Cloudflare R2 buckets. Uploads are hardened: MIME allowlist (jpg/png/webp/gif/svg/avif), 10 MB size cap, server-side Content-Type.
- **Articles & Pages**: Rich content editing using React TipTap WYSIWYG editor, custom image alignment, WordPress shortcodes (`[caption]` → `<figure>`, `[faq]` → `<details>`), auto Table of Contents, embed parsing, and revision history with atomic `version` increments.
- **Categories & Tags**: Hierarchical categories and tag taxonomies with automated slug scrubbing and category collision prevention. The term management page supports search, sorting, and pagination (50/page) for taxonomies with 10k+ terms.
- **Block Builder**: Pages and the front page assemble from layout blocks (heroes, category blocks, article grids) — no hardcoded templates.
- **Users & Roles**: Six-tier role architecture (`superadmin`, `admin`, `editor`, `author`, `contributor`, `user`). Astro middleware validates JWT session tokens for every `/admin` and `/api` request; mutating API endpoints enforce roles server-side.
- **SEO & Discoverability**: Automated XML sitemap generation (`/sitemap.xml`), dynamic JSON-LD Schema (`NewsArticle`, `WebSite`, `CollectionPage`, `BreadcrumbList`), markdown content delivery (`Accept: text/markdown` via Turndown), and RFC 9727 API Catalog support (`/.well-known/api-catalog`). Date archives are timezone-aware (Asia/Jakarta UTC+7).
- **Security**: Web Crypto PBKDF2 password hashing (plus WordPress `$wp$2y$` bcrypt and legacy phpass handling), `JWT_SECRET` required with no fallback, login rate limiting (5 attempts / 60s), `sanitize-html` on all user-editable output, soft-delete with trash/restore, security headers (nosniff, HSTS, X-Frame-Options), and fully parameterized Drizzle queries.

## Project Structure

```text
waritaku/
├── public/              # Static frontend assets
├── local_uploads/       # Local media upload folder (dev only)
├── src/
│   ├── assets/          # Raw image and icon assets
│   ├── components/      # React and Astro components (admin + frontend)
│   ├── db/              # Drizzle ORM database schemas
│   ├── i18n/            # Internationalization strings (en/id)
│   ├── layouts/         # Page layout templates
│   ├── lib/             # Database (db.ts) and Storage (storage.ts) adapters
│   ├── middleware.ts    # Auth guard, redirect engine, security headers, 404 logging
│   ├── pages/           # Astro routes and API endpoints
│   │   ├── admin/       # CMS admin dashboard and system docs
│   │   └── api/         # API endpoints (content, uploads, taxonomies, import)
│   ├── styles/          # Global CSS definitions and Tailwind setup
│   └── utils/           # Helper utilities (sanitize, embed parsing)
├── drizzle/             # Drizzle migration journal + SQL files
├── scripts/             # Setup wizard, WP import, R2 sync
├── astro.config.mjs     # Astro and Vite configuration
├── drizzle.config.ts    # Drizzle ORM configuration
└── package.json         # Project dependencies
```

## Quick Start & Installation

1. **Clone and Install**:
   ```bash
   git clone <your-repo-url>
   cd waritaku
   npm install
   ```

2. **Configure the JWT secret** (required — there is no fallback):
   ```bash
   # Local development: create .dev.vars
   echo 'JWT_SECRET="<a-long-random-string>"' > .dev.vars

   # Production: set as a Cloudflare secret
   npx wrangler secret put JWT_SECRET
   ```

3. **Run the Setup Wizard (Recommended)**:
   We provide an interactive CLI Setup Wizard that will automatically set up your local database and walk you through migrating your old WordPress data:
   ```bash
   npm run setup
   ```
   
   *Alternatively, to just initialize an empty database without migrating data:*
   ```bash
   npx wrangler d1 migrations apply DB --local
   npm run dev
   ```

4. **WordPress Migration (Manual)**:
   If you didn't use the Setup Wizard, you can find the complete **WordPress Migration Guide** in the CMS documentation at `http://localhost:4321/admin/docs` after logging in.

## Deploying to Cloudflare (Production)

Deploying a dynamic SSR site with a live database requires a few specific steps in your Cloudflare Dashboard. If you simply connect your GitHub repository without configuring the database bindings, your live site will crash.

### 1. Create your Production Database & Storage
First, create the live D1 database and R2 bucket using Wrangler in your terminal:
```bash
# Create the live D1 database
npx wrangler d1 create waritaku-prod

# Create the live R2 bucket for uploads
npx wrangler r2 bucket create waritaku-uploads
```

### 2. Configure Cloudflare Pages
Connect your GitHub repository in the Cloudflare Dashboard to create a new Pages project.
1. **Framework Preset**: Select `Astro` (Build command: `npm run build`, Output directory: `dist`).
2. **Environment Variables**: Add `NODE_VERSION` with the value `20`.
3. **Save and Deploy**: The first deploy will fail or 500 error — this is expected because the database isn't bound yet!

### 3. Bind the Database and Bucket
1. Go to your Pages project in the Cloudflare Dashboard → **Settings** → **Functions** (or **Bindings**).
2. Under **D1 database bindings**, click Add binding. 
   - Variable name: `DB`
   - D1 database: select your `waritaku-prod` database.
3. Under **R2 bucket bindings**, click Add binding.
   - Variable name: `UPLOADS`
   - R2 bucket: select your `waritaku-uploads` bucket.
4. Retry the deployment in Cloudflare.

### 4. Push your Local Data to Production
Your live database is currently empty! You need to push your local database structure and data to the live server.
Because WordPress data dumps can be massive (20MB+), standard Wrangler upload commands will fail with a `SQLITE_TOOBIG` error. We have provided a safe chunking script to handle this.

```bash
# 1. Export your local database to a dump file
sqlite3 local.db .dump > local-dump.sql

# 2. Run the chunking upload script
node scripts/push_d1_chunks.mjs
```
*(If the script pauses, ensure you update `push_d1_chunks.mjs` to target your specific production database name).*

### 5. Push your Media
Run the automated R2 Sync utility to recursively upload all your local images to your live bucket:
```bash
npm run push:media
```

## Development Commands

| Command | Action |
| :--- | :--- |
| `npm run setup` | Launches the interactive Setup & Migration CLI Wizard |
| `npm run push:media` | Syncs your local_uploads folder to Cloudflare R2 |
| `npm install` | Installs project dependencies |
| `npx wrangler d1 migrations apply DB --local` | Applies schema changes to the local D1 database |
| `npm run dev` | Starts local dev server at `localhost:4321` |
| `npm run dev --remote` | Starts dev server using remote Cloudflare D1 database |
| `npm run build` | Builds production output to `./dist/` |
| `npm run check` | Runs Astro type-checking (`astro check`) |

## Development Rules

- **Database Rule**: Do not wipe, delete, or recreate the database folder (`.wrangler`) unless explicitly authorized.
- **Migration Rule**: NEVER run `wrangler d1 migrations apply --local` blindly. If the `d1_migrations` table is empty or missing, Wrangler may forcefully wipe the local database to apply migrations from scratch, causing total data loss. Always verify state first (`scripts/setup.mjs` now includes a pre-flight safety check).
- **Data Integrity**: Do not insert arbitrary or fake data into the database.
- **Security**: Never commit `.env`, `.dev.vars`, or `local.db`. Keep `JWT_SECRET` out of source control.
- **Writing Standard**: All documentation prose follows ASD-STE100 Simplified Technical English (STE-flavored rules).
