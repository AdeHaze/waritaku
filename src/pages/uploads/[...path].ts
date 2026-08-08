import { StorageAdapter } from '../../lib/storage';
import { getMediaBaseUrl } from '../../lib/media';
import type { APIRoute } from 'astro';

// Handles /uploads/<key> — WordPress-style image URLs (e.g. /uploads/2020/02/file.webp).
//
// Production (PUBLIC_MEDIA_BASE_URL set):
//   301 redirect to the R2 custom domain - zero Worker proxy cost.
//   Browsers cache the 301, so each URL only hits the Worker once ever.
//
// Local dev (PUBLIC_MEDIA_BASE_URL not set):
//   The Vite middleware in astro.config.mjs serves /uploads/* from local_uploads/.
//   This route is never reached in local dev for existing images.
//   For images not in local_uploads/, it falls back to the R2 binding.
export const GET: APIRoute = async ({ params }) => {
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