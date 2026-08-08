import { StorageAdapter } from '../../lib/storage';
import type { APIRoute } from 'astro';

// Serves WordPress-style upload URLs: /uploads/YYYY/MM/filename.webp
// These map directly to R2 keys: YYYY/MM/filename.webp
export const GET: APIRoute = async ({ params }) => {
  const path = params.path;
  if (!path) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const { env } = await import('cloudflare:workers');
    if (env && env.UPLOADS) {
      const object = await StorageAdapter.getFile(env, path);

      if (object === null) {
        return new Response('Image Not Found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');

      return new Response(object.body, { headers });
    } else {
      return new Response('R2 bucket not configured', { status: 500 });
    }
  } catch (err: any) {
    return new Response(err.message, { status: 500 });
  }
};