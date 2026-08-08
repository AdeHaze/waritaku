import { StorageAdapter } from '../../lib/storage';
import { getMediaUrl } from '../../lib/media';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    }

    // Validate file type (allow only common image formats and PDF)
    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'pdf'];
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
        return new Response(JSON.stringify({ error: 'File type not allowed. Accepted: JPG, PNG, WebP, GIF, SVG, AVIF, PDF.' }), { status: 400 });
    }

    // Map extensions to MIME types
    const MIME_MAP: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
        pdf: 'application/pdf'
    };

    // Validate file size (10 MB max)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return new Response(JSON.stringify({ error: 'File too large. Maximum size: 10 MB.' }), { status: 400 });
    }

    // Generate a unique filename
    const arrayBuffer = await file.arrayBuffer();
    
    // simple random hex string
    const randomHex = [...crypto.getRandomValues(new Uint8Array(8))]
        .map(b => b.toString(16).padStart(2, '0')).join('');
    
    const uniqueFilename = `${Date.now()}-${randomHex}.${extension}`;

    // Get the R2 Bucket binding
    // In Astro Cloudflare adapter v6+, bindings are from cloudflare:workers
    const { env } = await import('cloudflare:workers');
    if (env && env.UPLOADS) {
        await StorageAdapter.uploadFile(env, uniqueFilename, arrayBuffer, {
            httpMetadata: {
                contentType: MIME_MAP[extension] || 'application/octet-stream',
            },
        });
        
        // Return the public URL for the uploaded file.
        // In production, this uses the configured R2 custom domain (PUBLIC_MEDIA_BASE_URL).
        // In local dev, it falls back to the /api/images/ Worker proxy route.
        const url = getMediaUrl(uniqueFilename);

        return new Response(JSON.stringify({ url, success: true }), { status: 200 });
    } else {
        return new Response(JSON.stringify({ error: 'R2 bucket not configured' }), { status: 500 });
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500 });
  }
};
