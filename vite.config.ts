/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages (sub-path) and Cloudflare Pages (root).
  base: './',
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/tuning/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
