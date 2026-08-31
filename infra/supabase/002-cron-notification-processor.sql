-- Apply in the hosted Supabase SQL editor only after storing both values in Vault:
--   remindly_app_url
--   remindly_scheduler_secret
-- The secret and production URL must never be committed to this file.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'remindly-process-due-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'remindly_app_url'
    ) || '/api/internal/process-due-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'remindly_scheduler_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- net.http_post is asynchronous. Inspect its returned request ID in
-- net._http_response and correlate it with ProcessorRun before declaring a
-- production run successful.
