import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract the first image src from HTML content as a thumbnail fallback. */
export function getThumbnail(content: string): string {
  if (!content) return '/placeholder.webp';
  const match = content.match(/<img[^>]+src="([^">]+)"/i);
  if (!match) return '/placeholder.webp';
  let url = match[1];
  // Rewrite WordPress dev URLs (127.0.0.1:port/wp-content/uploads/) to
  // /uploads/ paths so the render cache's rewriteMediaUrls can later turn
  // them into CDN URLs. Without this, archive/homepage block thumbnails
  // point to dead WordPress dev URLs instead of R2 CDN.
  url = url.replace(/https?:\/\/localhost(:\d+)?\/wp-content\/uploads\//gi, '/uploads/');
  url = url.replace(/https?:\/\/127\.0\.0\.1(:\d+)?\/wp-content\/uploads\//gi, '/uploads/');
  return url;
}
