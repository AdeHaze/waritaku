import { StorageAdapter } from '../../../lib/storage';
import { getMediaBaseUrl } from '../../../lib/media';
import type { APIRoute } from 'astro';

// Handles /api/images/<key> where <key> may contain slashes.
//
// Production (PUBLIC_MEDIA_BASE_URL set):
//   301 redirect to the R2 custom domain - zero Worker proxy cost.
//
// Local dev (PUBLIC_MEDIA_BASE_URL not set):
//   Proxy the object from the local R2 simulation via env.UPLOADS.
export const GET: APIRoute = async ({ params, request }) => {
  const path = params.path;
  if (!path) {
    return new Response('Not Found', { status: 404 });
  }

  // Redirect to CDN when a media base URL is configured.
  const base = getMediaBaseUrl();
  if (base) {
    return Response.redirect(`${base}/${path}`, 301);
  }

  // Local dev fallback: proxy from R2 binding.
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