-- A notification can have multiple delivery attempts across retries.
DROP INDEX IF EXISTS "email_send_attempts_notification_id_key";

CREATE INDEX "email_send_attempts_notification_id_attempted_at_idx"
  ON "email_send_attempts"("notification_id", "attempted_at");
