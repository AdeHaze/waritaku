import { drizzle } from 'drizzle-orm/d1';

/**
 * Generic Database Adapter Pattern
 *
 * This file centralizes all database connection logic.
 * Currently optimized for Cloudflare D1.
 * If you migrate to PostgreSQL, Vercel Postgres, or AWS Aurora,
 * change the connection logic HERE to avoid modifying 50+ UI components.
 *
 * Throws if the DB binding is missing so callers receive a clear error
 * instead of a null reference that propagates silently.
 */
export function getDb(env: any) {
    if (!env || !env.DB) {
        throw new Error(
            'Database binding (DB) is missing from the environment. ' +
            'Make sure the D1 database is bound in wrangler.toml or the Cloudflare dashboard.'
        );
    }

    // Cloudflare D1 Adapter
    return drizzle(env.DB);

    // Future: PostgreSQL Adapter
    // import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
    // import postgres from 'postgres';
    // const client = postgres(env.DATABASE_URL);
    // return drizzlePg(client);
}
