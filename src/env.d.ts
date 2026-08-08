/// <reference path="../.astro/types.d.ts" />

type Env = {
  DB: import("@cloudflare/workers-types").D1Database;
  UPLOADS: import("@cloudflare/workers-types").R2Bucket;
  RENDER_CACHE: import("@cloudflare/workers-types").R2Bucket;
};
type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    user?: import('./lib/auth').SessionPayload;
    t?: (key: string, fallback?: string) => string;
  }
}

declare module 'sanitize-html';

