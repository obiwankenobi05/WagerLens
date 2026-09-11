import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Resolves the public origin the site will be served from.
 *
 * Link unfurlers (WhatsApp, Slack, iMessage, Twitter) require an absolute
 * `og:image` URL; a relative one is simply ignored and no thumbnail appears.
 * The origin therefore has to be baked in at build time, in this order:
 *
 *   1. `VITE_SITE_URL`, set explicitly for a custom domain.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets automatically and
 *      which stays stable across deployments (unlike `VERCEL_URL`).
 *   3. Nothing, in which case the tags are emitted with relative URLs. The page
 *      still works; only the preview thumbnail is lost.
 */
function resolveSiteOrigin(): string {
  const explicit = process.env.VITE_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  return '';
}

/** Substitutes %SITE_ORIGIN% in index.html so the social tags carry real URLs. */
function siteOriginPlugin(): Plugin {
  const origin = resolveSiteOrigin();
  return {
    name: 'wagerlens-site-origin',
    transformIndexHtml(html) {
      if (!origin) {
        // Fall back to paths relative to the page so nothing 404s.
        return html.replace(/%SITE_ORIGIN%\//g, '').replace(/%SITE_ORIGIN%/g, '');
      }
      return html.replace(/%SITE_ORIGIN%/g, origin);
    },
  };
}

// Test configuration lives in vitest.config.ts. Vitest bundles its own Vite,
// so keeping the two files apart avoids a type clash between the two copies.
export default defineConfig({
  plugins: [react(), siteOriginPlugin()],
  // Relative base so a build can be served from a sub-path (GitHub Pages) as
  // well as from a domain root.
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // recharts pulls a large d3 surface with it; keeping that and React in
        // named chunks means a redeploy of app code does not invalidate either.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](recharts|d3-|victory-|internmap|delaunator|robust-predicates)/.test(id)) {
            return 'charts';
          }
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
});
