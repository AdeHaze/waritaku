import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, url }) => {
    // RFC 9727 API Catalog Linkset
    const baseUrl = new URL('/', url).href;
    const apiUrl = new URL('/api/', url).href;
    
    const linkset = {
        "linkset": [
            {
                "anchor": apiUrl,
                "service-desc": [
                    {
                        "href": new URL('/api/openapi.yaml', url).href,
                        "type": "application/yaml"
                    }
                ],
                "service-doc": [
                    {
                        "href": new URL('/admin/docs', url).href,
                        "type": "text/html"
                    }
                ],
                "status": [
                    {
                        "href": new URL('/api/health', url).href,
                        "type": "application/json"
                    }
                ]
            }
        ]
    };

    return new Response(JSON.stringify(linkset), {
        status: 200,
        headers: {
            'Content-Type': 'application/linkset+json',
            'Cache-Control': 'public, max-age=3600'
        }
    });
};
