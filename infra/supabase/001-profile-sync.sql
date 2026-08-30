-- Apply this script in the hosted Supabase SQL editor or a Supabase migration.
-- It must not be applied to the local Docker PostgreSQL database: auth.users is
-- managed by Supabase and is not present there.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    email_verified_at,
    timezone,
    default_alert_time
  ) values (
    new.id,
    new.email,
    new.email_confirmed_at,
    'UTC',
    '09:00'
  )
  on conflict (id) do update set
    email = excluded.email,
    email_verified_at = excluded.email_verified_at,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.handle_auth_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_profiles
  set
    email = new.email,
    email_verified_at = new.email_confirmed_at,
    updated_at = now()
  where id = new.id;

  return new;
end;
$$;

create or replace function public.handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_profiles where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute procedure public.handle_auth_user_update();

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute procedure public.handle_auth_user_deleted();

revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.handle_auth_user_update() from public;
revoke all on function public.handle_auth_user_deleted() from public;
