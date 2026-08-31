import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
const migrationPath = path.resolve(
  process.cwd(),
  'prisma/cutover/20260831100000_enforce_alert_cutover.sql',
);

describe('strict multi-alert cutover contract', () => {
  it('requires ownership and current alert linkage while preserving a rollback marker', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaPath, 'utf8'),
      readFile(migrationPath, 'utf8'),
    ]);

    expect(schema).toMatch(/userId\s+String\??\s+@map\("user_id"\)\s+@db\.Uuid/);
    expect(schema).toContain('dueAt');
    expect(schema).toContain('reminderAlertId');
    expect(schema).toContain('scheduleVersion');
    expect(migration).toContain('ALTER COLUMN "user_id" SET NOT NULL');
    expect(migration).toContain('ALTER COLUMN "due_at" SET NOT NULL');
    expect(migration).toContain('ALTER COLUMN "reminder_alert_id" SET NOT NULL');
    expect(migration).toContain('ALTER COLUMN "schedule_version" SET NOT NULL');
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).toContain('reminder_alert_id IS NULL');
    expect(migration).not.toContain('DROP COLUMN');
  });
});
