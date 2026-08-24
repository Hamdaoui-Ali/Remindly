import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { Client } from 'pg';

import { assertTestDatabaseUrl } from '../src/server/db/test-database';
import { ensureTestDatabase } from './test-database-setup';

function deployMigrations(testDatabaseUrl: string): void {
  execFileSync(
    process.execPath,
    [path.resolve(process.cwd(), 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'inherit',
    },
  );
}

export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = process.env.DATABASE_URL ?? '';

  assertTestDatabaseUrl(testDatabaseUrl);
  await ensureTestDatabase({
    testDatabaseUrl,
    createClient: (connectionString) => new Client({ connectionString }),
  });
  deployMigrations(testDatabaseUrl);
}
