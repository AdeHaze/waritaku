import { StorageAdapter } from '../../lib/storage';
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

    // Generate a unique filename
    const arrayBuffer = await file.arrayBuffer();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    
    // simple random hex string
    const randomHex = [...crypto.getRandomValues(new Uint8Array(8))]
        .map(b => b.toString(16).padStart(2, '0')).join('');
    
    const uniqueFilename = `${Date.now()}-${randomHex}.${extension}`;

    // Get the R2 Bucket binding from locals context
    // In Astro Cloudflare adapter, bindings are attached to locals.runtime.env
    const env = (locals as any).runtime?.env;
    if (env && env.UPLOADS) {
        await StorageAdapter.uploadFile(env, uniqueFilename, arrayBuffer, {
            httpMetadata: {
                contentType: file.type || 'image/jpeg',
            },
        });
        
        // Return the public URL for the uploaded file
        // For now, we will serve this through our own Astro API endpoint
        const url = `/api/images/${uniqueFilename}`;
        
        return new Response(JSON.stringify({ url, success: true }), { status: 200 });
    } else {
        return new Response(JSON.stringify({ error: 'R2 bucket not configured' }), { status: 500 });
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
