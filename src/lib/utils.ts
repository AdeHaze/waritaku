import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract the first image src from HTML content as a thumbnail fallback. */
export function getThumbnail(content: string): string {
  if (!content) return '/placeholder.webp';
  const match = content.match(/<img[^>]+src="([^">]+)"/i);
  return match ? match[1] : '/placeholder.webp';
}
