import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { Client } from 'pg';

import { assertTestDatabaseUrl } from '../src/server/db/test-database';

const SAFE_DATABASE_NAME = /^[A-Za-z_][A-Za-z0-9_]*_test$/;

function databaseNameFromUrl(databaseUrl: string): string {
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));

  if (!SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error('Refusing to create a database whose name is not a safe *_test PostgreSQL identifier.');
  }

  return databaseName;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function createTestDatabaseIfMissing(testDatabaseUrl: string): Promise<void> {
  const databaseName = databaseNameFromUrl(testDatabaseUrl);
  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();
    const existingDatabase = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);

    if (existingDatabase.rowCount === 0) {
      try {
        await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      } catch (error) {
        if ((error as { code?: string }).code !== '42P04') {
          throw error;
        }
      }
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

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
  await createTestDatabaseIfMissing(testDatabaseUrl);
  deployMigrations(testDatabaseUrl);
}
