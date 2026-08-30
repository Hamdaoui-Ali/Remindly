import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const profileSqlPath = path.resolve(process.cwd(), 'infra/supabase/001-profile-sync.sql');

describe('Supabase profile synchronization SQL', () => {
  it('uses a locked-down security-definer function for profile creation', async () => {
    const sql = await readFile(profileSqlPath, 'utf8');

    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('insert into public.user_profiles');
    expect(sql).toContain('on_auth_user_created');
  });

  it('synchronizes email changes and removes profiles when Auth users are deleted', async () => {
    const sql = await readFile(profileSqlPath, 'utf8');

    expect(sql).toContain('on_auth_user_updated');
    expect(sql).toContain('on_auth_user_deleted');
    expect(sql).toContain('delete from public.user_profiles');
  });
});
