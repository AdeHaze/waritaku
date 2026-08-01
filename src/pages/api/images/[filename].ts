import { StorageAdapter } from '../../../lib/storage';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  const filename = params.filename;
  if (!filename) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const env = (locals as any).runtime?.env;
    if (env && env.UPLOADS) {
        const object = await StorageAdapter.getFile(env, filename);
        
        if (object === null) {
            return new Response('Image Not Found', { status: 404 });
        }
        
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        return new Response(object.body, {
            headers,
        });
    } else {
        return new Response('R2 bucket not configured', { status: 500 });
    }
  } catch (err: any) {
    return new Response(err.message, { status: 500 });
  }
};
