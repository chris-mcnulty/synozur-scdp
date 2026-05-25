-- Add vendor_ingest_email column to users table (per-vendor AP invoice ingestion alias)
-- Originally added in PR36 schema but migration was never run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_ingest_email text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_vendor_ingest_email_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_vendor_ingest_email_unique UNIQUE (vendor_ingest_email);
  END IF;
END$$;
