-- Migration: Multi-currency estimates (Task #102)
-- Adds quoteCurrency, costCurrency, exchangeRate (and lock fields on estimates)
-- to estimates, projects, invoice_batches, and sows.
-- All ALTER TABLE statements use IF NOT EXISTS so the migration is safe to re-run.
-- Existing rows are backfilled with safe defaults (USD / rate 1).

-- ─── estimates ────────────────────────────────────────────────────────────────
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS quote_currency          VARCHAR(3)  NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS cost_currency           VARCHAR(3)  NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate           NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS exchange_rate_locked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS exchange_rate_source    VARCHAR(20) DEFAULT 'live';

-- Backfill: same-currency estimates get rate 1
UPDATE estimates
SET exchange_rate        = 1,
    exchange_rate_source = 'live'
WHERE quote_currency = cost_currency
  AND exchange_rate IS NULL;

-- ─── projects ─────────────────────────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS quote_currency          VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS cost_currency           VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate           NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS exchange_rate_locked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS exchange_rate_source    VARCHAR(20) DEFAULT 'live';

-- Backfill: carry estimate snapshot forward where a project is linked to one
UPDATE projects p
SET quote_currency          = COALESCE(e.quote_currency, 'USD'),
    cost_currency           = COALESCE(e.cost_currency,  'USD'),
    exchange_rate           = e.exchange_rate,
    exchange_rate_locked_at = e.exchange_rate_locked_at,
    exchange_rate_source    = COALESCE(e.exchange_rate_source, 'live')
FROM estimates e
WHERE p.estimate_id = e.id
  AND p.quote_currency = 'USD'
  AND p.cost_currency  = 'USD';

-- Remaining projects with no linked estimate: default to USD / rate 1
UPDATE projects
SET exchange_rate        = 1,
    exchange_rate_source = 'live'
WHERE quote_currency = cost_currency
  AND exchange_rate IS NULL;

-- ─── invoice_batches ──────────────────────────────────────────────────────────
ALTER TABLE invoice_batches
  ADD COLUMN IF NOT EXISTS quote_currency          VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS cost_currency           VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate           NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS exchange_rate_locked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS exchange_rate_source    VARCHAR(20) DEFAULT 'live';

-- Backfill: use a subquery to pick one representative project per batch
UPDATE invoice_batches ib
SET quote_currency          = sub.quote_currency,
    cost_currency           = sub.cost_currency,
    exchange_rate           = sub.exchange_rate,
    exchange_rate_source    = COALESCE(sub.exchange_rate_source, 'live')
FROM (
  SELECT DISTINCT ON (il.batch_id)
    il.batch_id,
    p.quote_currency,
    p.cost_currency,
    p.exchange_rate,
    p.exchange_rate_source
  FROM invoice_lines il
  JOIN projects p ON il.project_id = p.id
  ORDER BY il.batch_id
) sub
WHERE ib.batch_id       = sub.batch_id
  AND ib.quote_currency = 'USD'
  AND ib.cost_currency  = 'USD';

-- ─── sows ─────────────────────────────────────────────────────────────────────
ALTER TABLE sows
  ADD COLUMN IF NOT EXISTS quote_currency          VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS cost_currency           VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate           NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS exchange_rate_locked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS exchange_rate_source    VARCHAR(20) DEFAULT 'live';

-- Backfill: carry project currency snapshot to linked SOWs
UPDATE sows s
SET quote_currency          = COALESCE(p.quote_currency, 'USD'),
    cost_currency           = COALESCE(p.cost_currency,  'USD'),
    exchange_rate           = p.exchange_rate,
    exchange_rate_locked_at = p.exchange_rate_locked_at,
    exchange_rate_source    = COALESCE(p.exchange_rate_source, 'live')
FROM projects p
WHERE s.project_id    = p.id
  AND s.quote_currency = 'USD'
  AND s.cost_currency  = 'USD';
