-- Galaxy app client scoping: optionally bind a Galaxy app to a single client.
-- When client_id IS NULL, the app remains tenant-wide (existing behavior).
-- When set, /oauth/authorize and /oauth/token reject any consenting portal user
-- whose client binding does not match the app's client_id.

ALTER TABLE "galaxy_apps"
  ADD COLUMN IF NOT EXISTS "client_id" varchar
  REFERENCES "clients"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_galaxy_apps_client" ON "galaxy_apps" ("client_id");
