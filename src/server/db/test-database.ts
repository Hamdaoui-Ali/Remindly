const TEST_DATABASE_SUFFIX = '_test';
const SAFE_DATABASE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1']);
const MAX_POSTGRES_IDENTIFIER_BYTES = 63;
const CONNECTION_OVERRIDE_PARAMETERS = new Set(['host', 'hostaddr', 'dbname', 'database']);

type TestDatabaseUrlOptions = {
  databaseUrl?: string;
  testDatabaseUrl?: string;
};

function parsePostgreSqlUrl(value: string, variableName: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL connection URL.`);
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`${variableName} must use a PostgreSQL URL.`);
  }

  for (const parameterName of url.searchParams.keys()) {
    if (CONNECTION_OVERRIDE_PARAMETERS.has(parameterName.toLowerCase())) {
      throw new Error(`${variableName} must not include connection override parameter "${parameterName}".`);
    }
  }

  return url;
}

function databaseNameFromUrl(url: URL, variableName: string) {
  const encodedName = url.pathname.slice(1);

  if (!encodedName || encodedName.includes('/')) {
    throw new Error(`${variableName} must include exactly one database name.`);
  }

  let databaseName: string;

  try {
    databaseName = decodeURIComponent(encodedName);
  } catch {
    throw new Error(`${variableName} has an invalid database name.`);
  }

  if (!SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error(`${variableName} database name must be a safe PostgreSQL identifier.`);
  }

  if (new TextEncoder().encode(databaseName).byteLength > MAX_POSTGRES_IDENTIFIER_BYTES) {
    throw new Error(`${variableName} database name must be at most 63 UTF-8 bytes.`);
  }

  return databaseName;
}

function assertTestDatabaseName(databaseName: string, variableName: string) {
  if (!databaseName.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(`${variableName} database name must end with "${TEST_DATABASE_SUFFIX}".`);
  }

  if (!SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error(`${variableName} database name must be a safe PostgreSQL identifier.`);
  }

  if (new TextEncoder().encode(databaseName).byteLength > MAX_POSTGRES_IDENTIFIER_BYTES) {
    throw new Error(`${variableName} database name must be at most 63 UTF-8 bytes.`);
  }
}

export function resolveTestDatabaseUrl({
  databaseUrl,
  testDatabaseUrl,
}: TestDatabaseUrlOptions): string {
  if (testDatabaseUrl) {
    const explicitUrl = parsePostgreSqlUrl(testDatabaseUrl, 'TEST_DATABASE_URL');
    const explicitDatabaseName = databaseNameFromUrl(explicitUrl, 'TEST_DATABASE_URL');
    assertTestDatabaseName(explicitDatabaseName, 'TEST_DATABASE_URL');
    return explicitUrl.toString();
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when TEST_DATABASE_URL is not set.');
  }

  const developmentUrl = parsePostgreSqlUrl(databaseUrl, 'DATABASE_URL');

  if (!LOCAL_DATABASE_HOSTS.has(developmentUrl.hostname)) {
    throw new Error('TEST_DATABASE_URL is required when DATABASE_URL is not localhost or 127.0.0.1.');
  }

  const developmentDatabaseName = databaseNameFromUrl(developmentUrl, 'DATABASE_URL');

  if (developmentDatabaseName.toLowerCase().endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error('DATABASE_URL database name already ends with "_test" and cannot be derived again.');
  }

  developmentUrl.pathname = `/${developmentDatabaseName}${TEST_DATABASE_SUFFIX}`;
  const derivedTestDatabaseUrl = developmentUrl.toString();
  assertTestDatabaseUrl(derivedTestDatabaseUrl);
  return derivedTestDatabaseUrl;
}

export function assertTestDatabaseUrl(databaseUrl: string): void {
  const url = parsePostgreSqlUrl(databaseUrl, 'DATABASE_URL');
  const databaseName = databaseNameFromUrl(url, 'DATABASE_URL');
  assertTestDatabaseName(databaseName, 'DATABASE_URL');
}
