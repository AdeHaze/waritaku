# Waritaku CMS

Waritaku CMS is a modern content management system built with Astro, Cloudflare D1, and Cloudflare R2.

## Overview

This repository contains the source code for Waritaku CMS. The system uses Astro for server-side rendering, React for dynamic admin interfaces, Drizzle ORM for database operations, and Cloudflare infrastructure for database and object storage.

## System Architecture & Features

- **Database Environments**: Uses Miniflare for local development (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`), Cloudflare D1 staging for remote testing (`npm run dev --remote`), and Cloudflare D1 for production.
- **Adapter Pattern**: Decoupled architecture using `src/lib/db.ts` (database adapter) and `src/lib/storage.ts` (storage adapter) to prevent vendor lock-in.
- **Media Uploads**: Local development uploads save to `/local_uploads` via a custom Vite plugin. Production uploads send files directly to Cloudflare R2 buckets.
- **Articles & Pages**: Rich content editing using React TipTap WYSIWYG editor, custom image alignment, shortcodes, and revision history.
- **Categories & Tags**: Hierarchical categories and tag taxonomies with automated slug scrubbing and category collision prevention.
- **Users & Roles**: Two-tier role architecture (`admin` and `superadmin`). Astro middleware validates session tokens for every request.
- **SEO & Discoverability**: Automated XML sitemap generation (`/sitemap.xml`), dynamic JSON-LD Schema (`NewsArticle`, `WebSite`), markdown content delivery (`Accept: text/markdown`), and RFC 9727 API Catalog support (`/.well-known/api-catalog`).

## Project Structure

```text
waritaku/
├── public/              # Static frontend assets
├── local_uploads/       # Local media upload folder (dev only)
├── src/
│   ├── components/      # React and Astro components
│   ├── db/              # Drizzle ORM database schemas
│   ├── layouts/         # Page layout templates
│   ├── lib/             # Database and storage generic adapters
│   └── pages/           # Astro routes and API endpoints
│       └── admin/       # CMS admin dashboard and system docs
├── astro.config.mjs     # Astro and Vite configuration
├── package.json         # Project dependencies
└── README.md            # System documentation
```

## Quick Start & Installation

1. **Clone and Install**:
   ```bash
   git clone <your-repo-url>
   cd waritaku
   npm install
   ```

2. **Run the Setup Wizard (Recommended)**:
   We provide an interactive CLI Setup Wizard that will automatically set up your local database and walk you through migrating your old WordPress data:
   ```bash
   npm run setup
   ```
   
   *Alternatively, to just initialize an empty database without migrating data:*
   ```bash
   npx wrangler d1 migrations apply DB --local
   npm run dev
   ```

3. **WordPress Migration (Manual)**:
   If you didn't use the Setup Wizard, you can find the complete **WordPress Migration Guide** in the CMS documentation at `http://localhost:4321/admin/docs` after logging in.

## Pushing to Production

Once you're happy with your local environment, you can push your database and media to Cloudflare.

1. **Pushing the Database (D1)**:
   Export your local SQLite database and execute it on your live remote database:
   ```bash
   npx wrangler d1 export DB --local --output=local-dump.sql
   npx wrangler d1 execute DB --remote --file=local-dump.sql
   ```

2. **Pushing Media (R2)**:
   Run the automated R2 Sync utility to recursively upload all your images:
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

## Development Rules

- **Database Rule**: Do not wipe, delete, or recreate the database folder (`.wrangler`) unless explicitly authorized.
- **Migration Rule**: NEVER run `wrangler d1 migrations apply --local` blindly. If the `d1_migrations` table is empty or missing, Wrangler may forcefully wipe the local database to apply migrations from scratch, causing total data loss. Always verify state first.
- **Data Integrity**: Do not insert arbitrary or fake data into the database.
- **Writing Standard**: All documentation prose follows ASD-STE100 Simplified Technical English (STE-flavored rules).
