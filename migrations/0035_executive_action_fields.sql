ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "executive_action_text" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "executive_action_enabled" boolean DEFAULT false;
