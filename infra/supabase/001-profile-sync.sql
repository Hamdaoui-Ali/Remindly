-- Apply this script in the hosted Supabase SQL editor or a Supabase migration.
-- It must not be applied to the local Docker PostgreSQL database: auth.users is
-- managed by Supabase and is not present there.

-- Auth owns the lifecycle. This foreign key is the authoritative deletion
-- policy: deleting auth.users deletes the profile and all owned application
-- rows through the Prisma-managed cascade relations.
do $$
begin
  begin
    alter table public.user_profiles
      add constraint user_profiles_auth_user_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  exception
    when duplicate_object then null;
  end;
end;
$$;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute procedure public.handle_auth_user_update();

revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.handle_auth_user_update() from public;
