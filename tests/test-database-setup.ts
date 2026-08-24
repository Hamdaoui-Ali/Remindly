import { assertTestDatabaseUrl } from '../src/server/db/test-database';

type DatabaseQueryResult = {
  rowCount: number | null;
};

export type TestDatabaseClient = {
  connect: () => Promise<unknown>;
  end: () => Promise<void>;
  query: (query: string, values?: string[]) => Promise<DatabaseQueryResult>;
};

type EnsureTestDatabaseOptions = {
  testDatabaseUrl: string;
  createClient: (connectionString: string) => TestDatabaseClient;
};

const SAFE_TEST_DATABASE_NAME = /^[A-Za-z_][A-Za-z0-9_]*_test$/;

function databaseNameFromUrl(databaseUrl: string): string {
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));

  if (!SAFE_TEST_DATABASE_NAME.test(databaseName)) {
    throw new Error('Refusing to create a database whose name is not a safe *_test PostgreSQL identifier.');
  }

  return databaseName;
}

function postgresAdminUrl(databaseUrl: string): string {
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  return adminUrl.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function closeClient(client: TestDatabaseClient): Promise<void> {
  await client.end().catch(() => undefined);
}

export async function ensureTestDatabase({
  testDatabaseUrl,
  createClient,
}: EnsureTestDatabaseOptions): Promise<void> {
  assertTestDatabaseUrl(testDatabaseUrl);

  const directClient = createClient(testDatabaseUrl);

  try {
    await directClient.connect();
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== '3D000') {
      throw error;
    }
  } finally {
    await closeClient(directClient);
  }

  const databaseName = databaseNameFromUrl(testDatabaseUrl);
  const adminClient = createClient(postgresAdminUrl(testDatabaseUrl));

  try {
    await adminClient.connect();
    const existingDatabase = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);

    if (existingDatabase.rowCount === 0) {
      try {
        await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      } catch (error) {
        if ((error as { code?: string }).code !== '42P04') {
          throw error;
        }
      }
    }
  } finally {
    await closeClient(adminClient);
  }
}
