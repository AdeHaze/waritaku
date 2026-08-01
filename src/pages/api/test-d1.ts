import { getDb } from "../../lib/db";
import { users } from '../../db/schema.js';

export async function POST({ request, locals, env }) {
  const db = getDb(env);
  try {
    const chunk = [
      {
        id: 1,
        name: 'AdeHaze',
        slug: 'adehaze',
        email: 'me@adehaze.com',
        passwordHash: 'hash',
        role: 'admin',
        firstName: null,
        lastName: null,
        bio: null,
        avatarUrl: null,
        socialLinks: null,
        createdAt: '2020-01-03T19:01:49.000Z'
      }
    ];
    await db.insert(users).values(chunk).onConflictDoNothing();
    return new Response(JSON.stringify({ success: true }));
  } catch (err: any) {
    console.error('FULL ERROR:', err);
    return new Response(JSON.stringify({ success: false, error: err.message, cause: err.cause }), { status: 500 });
  }
}
