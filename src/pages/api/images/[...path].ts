import { StorageAdapter } from '../../../lib/storage';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params }) => {
  // params.path captures the full sub-path including slashes, e.g.:
  //   /api/images/flat-file.webp          -> "flat-file.webp"
  //   /api/images/2020/02/file.webp       -> "2020/02/file.webp"
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