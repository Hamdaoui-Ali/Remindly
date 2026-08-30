import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const profileSqlPath = path.resolve(process.cwd(), 'infra/supabase/001-profile-sync.sql');

async function readProfileSql(): Promise<string> {
  return readFile(profileSqlPath, 'utf8');
}

describe('Supabase profile synchronization SQL', () => {
  it('uses a locked-down security-definer function for profile creation', async () => {
    const sql = await readProfileSql();

    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('insert into public.user_profiles');
    expect(sql).toContain('on_auth_user_created');
  });

  it('synchronizes email changes and delegates deletion to the Auth foreign key', async () => {
    const sql = await readProfileSql();

    expect(sql).toContain('on_auth_user_updated');
    expect(sql).toContain('user_profiles_auth_user_fkey');
    expect(sql).toContain('on delete cascade');
  });

  it('makes Auth deletion cascade explicit and keeps deployment idempotent', async () => {
    const sql = await readProfileSql();

    expect(sql).toContain('foreign key (id) references auth.users(id) on delete cascade');
    expect(sql).toContain('duplicate_object');
    expect(sql).toContain('create or replace function public.handle_auth_user_update');
  });
});
