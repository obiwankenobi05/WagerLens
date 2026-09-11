import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// The analytics and parser layers are pure TypeScript with no DOM dependency,
// so the suite runs in a plain node environment without a React renderer.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
