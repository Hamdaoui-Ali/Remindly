-- CreateEnum
CREATE TYPE "EmailPurpose" AS ENUM ('REMINDER', 'AUTH');

-- CreateEnum
CREATE TYPE "EmailAttemptOutcome" AS ENUM ('RESERVED', 'ACCEPTED', 'DEFINITE_FAILURE', 'UNKNOWN_OUTCOME');

-- CreateEnum
CREATE TYPE "ProcessorRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "notifications"
    ADD COLUMN "last_error_code" TEXT,
    ADD COLUMN "reminder_alert_id" UUID,
    ADD COLUMN "schedule_version" INTEGER;

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN "user_id" UUID;

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "default_alert_time" TEXT NOT NULL DEFAULT '09:00',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_alerts" (
    "id" UUID NOT NULL,
    "reminder_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "offset_minutes" INTEGER,
    "schedule_version" INTEGER NOT NULL DEFAULT 1,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reminder_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_send_attempts" (
    "id" UUID NOT NULL,
    "purpose" "EmailPurpose" NOT NULL,
    "outcome" "EmailAttemptOutcome" NOT NULL DEFAULT 'RESERVED',
    "sanitized_code" TEXT,
    "provider_message_id" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_send_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processor_runs" (
    "id" UUID NOT NULL,
    "status" "ProcessorRunStatus" NOT NULL DEFAULT 'RUNNING',
    "claimed" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "recovered" INTEGER NOT NULL DEFAULT 0,
    "sanitized_failure_code" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "processor_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_email_key" ON "user_profiles"("email");

-- CreateIndex
CREATE INDEX "reminder_alerts_reminder_id_scheduled_for_idx" ON "reminder_alerts"("reminder_id", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_alerts_reminder_id_scheduled_for_channel_key" ON "reminder_alerts"("reminder_id", "scheduled_for", "channel");

-- CreateIndex
CREATE INDEX "email_send_attempts_attempted_at_purpose_outcome_idx" ON "email_send_attempts"("attempted_at", "purpose", "outcome");

-- CreateIndex
CREATE INDEX "processor_runs_status_started_at_idx" ON "processor_runs"("status", "started_at");

-- CreateIndex
CREATE INDEX "notifications_reminder_alert_id_schedule_version_idx" ON "notifications"("reminder_alert_id", "schedule_version");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_reminder_alert_id_schedule_version_channel_key" ON "notifications"("reminder_alert_id", "schedule_version", "channel");

-- CreateIndex
CREATE INDEX "reminders_user_id_idx" ON "reminders"("user_id");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_alerts" ADD CONSTRAINT "reminder_alerts_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reminder_alert_id_fkey" FOREIGN KEY ("reminder_alert_id") REFERENCES "reminder_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
