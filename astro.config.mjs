import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import fs from 'node:fs';
import path from 'node:path';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  server: {
    host: '127.0.0.1'
  },
  vite: {
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      exclude: ['diff']
    },
    build: {
      rollupOptions: {
        external: ['crypto']
      }
    },
    plugins: [
      tailwindcss(),
      {
        name: 'serve-local-uploads',
        configureServer(server) {
          server.middlewares.use('/uploads', (req, res, next) => {
            if (!req.url) return next();
            // req.url strips the /uploads prefix because of the mount point
            const decodedUrlPath = decodeURIComponent(req.url.split('?')[0]);
            let filePath = path.join(process.cwd(), 'local_uploads', decodedUrlPath);
            
            // Auto-fallback to .webp if the .jpg/.png doesn't exist but the converted .webp does
            if (!fs.existsSync(filePath)) {
              const ext = path.extname(filePath).toLowerCase();
              if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                const webpPath = filePath.substring(0, filePath.length - ext.length) + '.webp';
                if (fs.existsSync(webpPath)) {
                  filePath = webpPath;
                }
              }
            }

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              res.setHeader('Cache-Control', 'public, max-age=31536000');
              const ext = path.extname(filePath).toLowerCase();
              const contentTypes = { 
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', 
                '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml'
              };
              if (contentTypes[ext]) res.setHeader('Content-Type', contentTypes[ext]);
              res.end(fs.readFileSync(filePath));
            } else {
              next();
            }
          });
        }
      }
    ],
    server: {
      host: '127.0.0.1',
      watch: {
        ignored: ['**/.wrangler/**', '**/local_uploads/**']
      }
    }
  },
  trailingSlash: 'ignore',
  output: 'server',
  adapter: cloudflare()
});