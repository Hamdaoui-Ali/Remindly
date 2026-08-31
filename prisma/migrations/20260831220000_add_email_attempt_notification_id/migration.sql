ALTER TABLE "email_send_attempts"
  ADD COLUMN "notification_id" UUID;

CREATE UNIQUE INDEX "email_send_attempts_notification_id_key"
  ON "email_send_attempts"("notification_id");
