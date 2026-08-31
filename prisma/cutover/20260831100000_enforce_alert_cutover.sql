-- Manual strict alert cutover. Do not place this file in Prisma's automatic
-- migrations directory until reminders:backfill reports ready=true.
-- Legacy schedule columns remain until the separately reviewable cleanup step.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM reminders WHERE user_id IS NULL AND status = 'ACTIVE'::"ReminderStatus") THEN
    RAISE EXCEPTION 'Cannot enforce reminder ownership: active reminders are missing user_id';
  END IF;

  IF EXISTS (SELECT 1 FROM reminders WHERE due_at IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce reminder deadlines: reminders are missing due_at';
  END IF;

  IF EXISTS (SELECT 1 FROM notifications WHERE reminder_alert_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce alert linkage: notifications are missing reminder_alert_id';
  END IF;

  IF EXISTS (SELECT 1 FROM notifications WHERE schedule_version IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce schedule versions: notifications are missing schedule_version';
  END IF;
END;
$$;

ALTER TABLE "reminders"
  ALTER COLUMN "user_id" SET NOT NULL,
  ALTER COLUMN "due_at" SET NOT NULL;

ALTER TABLE "notifications"
  ALTER COLUMN "reminder_alert_id" SET NOT NULL,
  ALTER COLUMN "schedule_version" SET NOT NULL;
