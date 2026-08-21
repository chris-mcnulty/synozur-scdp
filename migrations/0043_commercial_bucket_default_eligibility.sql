ALTER TABLE commercial_buckets
  ADD COLUMN IF NOT EXISTS default_eligibility_outcome varchar(50);