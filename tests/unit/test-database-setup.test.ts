import { describe, expect, it, vi } from 'vitest';

import { ensureTestDatabase } from '../test-database-setup';

const TEST_DATABASE_URL = 'postgresql://localhost/remindly_test';

describe('ensureTestDatabase', () => {
  it('uses a directly connectable test database without accessing postgres', async () => {
    const directClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
    };
    const createClient = vi.fn(() => directClient);

    await ensureTestDatabase({ testDatabaseUrl: TEST_DATABASE_URL, createClient });

    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith(TEST_DATABASE_URL);
    expect(directClient.connect).toHaveBeenCalledOnce();
    expect(directClient.end).toHaveBeenCalledOnce();
  });

  it('creates a missing test database through postgres after a 3D000 direct connection error', async () => {
    const missingDatabaseError = Object.assign(new Error('database does not exist'), { code: '3D000' });
    const directClient = {
      connect: vi.fn().mockRejectedValue(missingDatabaseError),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
    };
    const adminClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn()
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: null }),
    };
    const createClient = vi.fn()
      .mockReturnValueOnce(directClient)
      .mockReturnValueOnce(adminClient);

    await ensureTestDatabase({ testDatabaseUrl: TEST_DATABASE_URL, createClient });

    expect(createClient).toHaveBeenNthCalledWith(2, 'postgresql://localhost/postgres');
    expect(adminClient.query).toHaveBeenNthCalledWith(1, 'SELECT 1 FROM pg_database WHERE datname = $1', ['remindly_test']);
    expect(adminClient.query).toHaveBeenNthCalledWith(2, 'CREATE DATABASE "remindly_test"');
  });

  it('preserves a direct authentication failure without falling back to postgres', async () => {
    const authenticationError = Object.assign(new Error('password authentication failed'), { code: '28P01' });
    const directClient = {
      connect: vi.fn().mockRejectedValue(authenticationError),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
    };
    const createClient = vi.fn(() => directClient);

    await expect(ensureTestDatabase({ testDatabaseUrl: TEST_DATABASE_URL, createClient }))
      .rejects.toBe(authenticationError);
    expect(createClient).toHaveBeenCalledOnce();
  });
});
