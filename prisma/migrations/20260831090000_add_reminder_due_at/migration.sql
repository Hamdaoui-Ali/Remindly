-- Add the target reminder deadline without removing legacy schedule fields.
ALTER TABLE "reminders"
    ADD COLUMN "due_at" TIMESTAMPTZ(6);

CREATE INDEX "reminders_status_due_at_idx"
    ON "reminders"("status", "due_at");
