import { describe, expect, it } from 'vitest';

import {
  assertTestDatabaseUrl,
  resolveTestDatabaseUrl,
} from '@/server/db/test-database';

describe('resolveTestDatabaseUrl', () => {
  it('derives a localhost test database while preserving the connection details', () => {
    expect(resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://remindly:remindly@localhost:5432/remindly?sslmode=disable',
    })).toBe('postgresql://remindly:remindly@localhost:5432/remindly_test?sslmode=disable');
  });

  it('derives a test database from a 127.0.0.1 development URL', () => {
    expect(resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://127.0.0.1:5432/remindly',
    })).toBe('postgresql://127.0.0.1:5432/remindly_test');
  });

  it('uses an explicit test database URL without requiring a local host', () => {
    expect(resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://localhost:5432/remindly',
      testDatabaseUrl: 'postgresql://ci.example.test:5432/remindly_ci_test',
    })).toBe('postgresql://ci.example.test:5432/remindly_ci_test');
  });

  it('rejects an implicit remote database URL', () => {
    expect(() => resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://db.example.test:5432/remindly',
    })).toThrow('TEST_DATABASE_URL');
  });

  it('rejects a missing development database URL', () => {
    expect(() => resolveTestDatabaseUrl({})).toThrow('DATABASE_URL is required');
  });

  it('rejects a non-PostgreSQL URL', () => {
    expect(() => resolveTestDatabaseUrl({
      databaseUrl: 'mysql://localhost/remindly',
    })).toThrow('PostgreSQL');
  });

  it('rejects an already-suffixed source database name', () => {
    expect(() => resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://localhost/remindly_test',
    })).toThrow('already ends with "_test"');
  });

  it('rejects an explicit database URL whose name is not a test database', () => {
    expect(() => resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://localhost/remindly',
      testDatabaseUrl: 'postgresql://ci.example.test/remindly',
    })).toThrow('must end with "_test"');
  });

  it('rejects an explicit test database name that is not a safe identifier', () => {
    expect(() => resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://localhost/remindly',
      testDatabaseUrl: 'postgresql://ci.example.test/remindly-production_test',
    })).toThrow('safe PostgreSQL identifier');
  });

  it.each([
    'host',
    'HOST',
    'hostaddr',
    'dbname',
    'database',
  ])('rejects a %s query parameter that can override the connection target', (parameterName) => {
    expect(() => resolveTestDatabaseUrl({
      databaseUrl: `postgresql://localhost/remindly?${parameterName}=example.com`,
    })).toThrow('must not include connection override parameter');
  });

  it('rejects duplicate connection override query parameters', () => {
    expect(() => resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://localhost/remindly?host=localhost&HOST=example.com',
    })).toThrow('must not include connection override parameter');
  });

  it('derives a test name at PostgreSQL’s 63-byte identifier limit', () => {
    expect(resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://localhost/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })).toBe('postgresql://localhost/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_test');
  });

  it('rejects a source name whose derived test name would exceed PostgreSQL’s 63-byte identifier limit', () => {
    expect(() => resolveTestDatabaseUrl({
      databaseUrl: 'postgresql://localhost/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })).toThrow('at most 63 UTF-8 bytes');
  });
});

describe('assertTestDatabaseUrl', () => {
  it('allows a safe PostgreSQL test database URL', () => {
    expect(() => assertTestDatabaseUrl('postgresql://localhost/remindly_test')).not.toThrow();
  });

  it('aborts destructive tests when the active database is the app database', () => {
    expect(() => assertTestDatabaseUrl('postgresql://localhost/remindly')).toThrow('must end with "_test"');
  });

  it('rejects a final test database name longer than PostgreSQL’s 63-byte identifier limit', () => {
    expect(() => assertTestDatabaseUrl(
      'postgresql://localhost/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_test',
    )).toThrow('at most 63 UTF-8 bytes');
  });
});
