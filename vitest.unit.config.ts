import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Keep direct unit/app runs deterministic and avoid worker-start contention.
    fileParallelism: false,
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/app/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup-unit.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
