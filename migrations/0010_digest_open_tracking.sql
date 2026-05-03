-- Task #130: Track whether users actually open their digest emails.
-- Adds open-tracking fields to digest_sends. Correlation is by digestSendId
-- (passed via SendGrid customArgs) with sgMessageId as a fallback.

ALTER TABLE "digest_sends"
  ADD COLUMN IF NOT EXISTS "sg_message_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "opened_at" timestamp,
  ADD COLUMN IF NOT EXISTS "open_count" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "idx_digest_sends_sg_message_id"
  ON "digest_sends" ("sg_message_id");
