import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

// Test runs need the same NEXT_PUBLIC_SUPABASE_* vars the dev server reads from
// .env.local (createBrowserClient() in src/lib/supabase-browser.ts calls eagerly
// at module load) — Next.js loads .env.local itself, but a bare vitest run doesn't.
if (fs.existsSync(path.resolve(__dirname, '.env.local'))) {
  process.loadEnvFile(path.resolve(__dirname, '.env.local'));
}

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: [
      'src/__tests__/**/*.test.{ts,tsx}',
      'src/tests/**/*.test.{ts,tsx}',
      'workers/**/*.test.{ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      sharp: path.resolve(__dirname, './workers/yukti-image-worker/src/sharp-test-entry.ts'),
    },
  },
});
