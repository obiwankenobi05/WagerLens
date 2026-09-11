import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Test configuration lives in vitest.config.ts. Vitest bundles its own Vite,
// so keeping the two files apart avoids a type clash between the two copies.
export default defineConfig({
  plugins: [react()],
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
