// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        // Same-origin "/api" in every environment (see docs/plans/monorepo-migration.md — no
        // CORS by design). In dev there's no nginx to make that true, so the Astro dev server's
        // own Vite proxy stands in for it. API_PROXY_TARGET is set to the "api" service's
        // in-network address by docker-compose.dev.yml; the localhost default covers `pnpm dev`
        // run directly on the host.
        '/api': {
          target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  },
});
