/**
 * Generic Storage Adapter Pattern
 * 
 * This file centralizes media uploading, deleting, fetching, and listing.
 * Currently optimized for Cloudflare R2 via env.UPLOADS binding.
 * If you migrate to AWS S3, modify this file instead of the UI logic.
 */

export const StorageAdapter = {
    async uploadFile(env: any, key: string, data: any, options?: any) {
        if (!env || !env.UPLOADS) return null;
        return await env.UPLOADS.put(key, data, options);
    },

    async deleteFile(env: any, key: string) {
        if (!env || !env.UPLOADS) return null;
        return await env.UPLOADS.delete(key);
    },

    async getFile(env: any, key: string) {
        if (!env || !env.UPLOADS) return null;
        return await env.UPLOADS.get(key);
    },

    async listFiles(env: any, options?: any) {
        if (!env || !env.UPLOADS) return null;
        return await env.UPLOADS.list(options);
    }
};
