CREATE TYPE "GmailCircuitStateStatus" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

CREATE TABLE "gmail_circuit_state" (
  "id" TEXT NOT NULL,
  "state" "GmailCircuitStateStatus" NOT NULL DEFAULT 'CLOSED',
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "opened_at" TIMESTAMPTZ(6),
  "last_failure_code" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gmail_circuit_state_pkey" PRIMARY KEY ("id")
);

INSERT INTO "gmail_circuit_state" ("id") VALUES ('singleton');
