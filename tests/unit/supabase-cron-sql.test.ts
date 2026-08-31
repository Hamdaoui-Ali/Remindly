import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sqlPath = path.resolve(process.cwd(), 'infra/supabase/002-cron-notification-processor.sql');

describe('Supabase Cron processor contract', () => {
  it('schedules the protected processor every minute through Vault', async () => {
    const sql = await readFile(sqlPath, 'utf8');

    expect(sql).toContain('create extension if not exists pg_cron');
    expect(sql).toContain('create extension if not exists pg_net');
    expect(sql).toContain("'* * * * *'");
    expect(sql).toContain("name = 'remindly_app_url'");
    expect(sql).toContain("name = 'remindly_scheduler_secret'");
    expect(sql).toContain('/api/internal/process-due-notifications');
    expect(sql).not.toMatch(/https?:\/\/[^\s'`$]+/);
    expect(sql).not.toMatch(/x-scheduler-secret\s*[:=]\s*['\"][^'\"]+['\"]/);
  });
});
