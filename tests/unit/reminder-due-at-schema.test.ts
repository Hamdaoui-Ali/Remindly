import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
const migrationPath = path.resolve(
  process.cwd(),
  'prisma/migrations/20260831090000_add_reminder_due_at/migration.sql',
);

describe('reminder due timestamp schema contract', () => {
  it('declares a nullable timestamptz dueAt during the additive migration', async () => {
    const schema = await readFile(schemaPath, 'utf8');
    const migration = await readFile(migrationPath, 'utf8');

    expect(schema).toContain('dueAt');
    expect(schema).toContain('@map("due_at") @db.Timestamptz(6)');
    expect(migration).toContain('ADD COLUMN "due_at" TIMESTAMPTZ(6)');
  });
});
