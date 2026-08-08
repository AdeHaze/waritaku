/**
 * Media URL helper.
 *
 * Controls all public URLs for uploaded media (images, PDFs, etc.).
 *
 * Configuration:
 *   Set PUBLIC_MEDIA_BASE_URL in your environment to point to your R2 custom domain.
 *   Example (CF Pages dashboard or .env): PUBLIC_MEDIA_BASE_URL=https://r2.waritaku.com
 *
 *   Leave the variable unset for local dev. Images are served via the
 *   /api/images/ Worker route which reads from the local R2 simulation.
 *
 * Usage:
 *   import { getMediaUrl } from '../lib/media';
 *   const src = getMediaUrl('2025/07/file.webp');
 *   // production  -> https://r2.waritaku.com/2025/07/file.webp
 *   // local dev   -> /api/images/2025/07/file.webp
 */

function mediaBase(): string {
    const raw = import.meta.env.PUBLIC_MEDIA_BASE_URL as string | undefined;
    return raw ? raw.replace(/\/$/, '') : '';
}

/**
 * Build a public URL for a media object.
 * @param key - the R2 object key, e.g. "2025/07/file.webp" or "flat-file.webp"
 */
export function getMediaUrl(key: string): string {
    const clean = key.startsWith('/') ? key.slice(1) : key;
    const base = mediaBase();
    return base ? `${base}/${clean}` : `/api/images/${clean}`;
}

/**
 * The configured media base URL, or an empty string in local dev.
 * Useful when you need to build URLs manually or check whether a CDN is configured.
 */
export function getMediaBaseUrl(): string {
    return mediaBase();
}