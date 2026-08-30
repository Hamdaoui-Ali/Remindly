import nextEnv from '@next/env';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

import { resolveTestDatabaseUrl } from './src/server/db/test-database.ts';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
process.env.DATABASE_URL = resolveTestDatabaseUrl({
  databaseUrl: process.env.DATABASE_URL,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
});
// Unit tests exercise serverEnv() without loading a hosted Supabase project.
// The migration URL is overridden to the isolated test database in global setup.
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
