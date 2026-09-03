-- Cut legacy inbound contractor invoices over to the canonical vendor AP ledger.
-- This is intentionally one PostgreSQL statement: any failed validation rolls
-- back the copies and FK change together. Historical rows are not cost-posted.
DO $migration$
DECLARE
  source_invoice_count bigint;
  source_line_count bigint;
  source_invoice_total numeric;
  source_line_total numeric;
  allocation_count_before bigint;
  allocation_total_before numeric;
  allocation_count_after bigint;
  allocation_total_after numeric;
  constraint_row record;
BEGIN
  LOCK TABLE contractor_cost_invoices, contractor_cost_invoice_lines,
    vendor_invoices, vendor_invoice_lines, contractor_payment_allocations,
    project_cost_postings IN SHARE ROW EXCLUSIVE MODE;

  ALTER TABLE vendor_invoices
    ADD COLUMN IF NOT EXISTS engagement_label text;

  IF EXISTS (
    SELECT 1 FROM contractor_cost_invoices
    WHERE status NOT IN ('draft', 'submitted', 'approved', 'paid')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: unknown legacy invoice status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines
    WHERE kind NOT IN ('service', 'expense')
       OR reconcile_status NOT IN ('unreconciled', 'reconciled', 'approved')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: unknown legacy line lifecycle value';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM contractor_cost_invoices
    GROUP BY tenant_id, contractor_user_id, invoice_number
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM contractor_cost_invoice_lines
    GROUP BY invoice_id, line_number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: legacy invoice or line uniqueness violation';
  END IF;

  -- A natural-key collision with a pre-existing canonical invoice must never
  -- be silently treated as the legacy row.
  IF EXISTS (
    SELECT 1
    FROM contractor_cost_invoices source
    JOIN vendor_invoices destination
      ON destination.tenant_id = source.tenant_id
     AND destination.vendor_user_id = source.contractor_user_id
     AND destination.vendor_invoice_number = source.invoice_number
     AND destination.id <> source.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: canonical invoice number collision';
  END IF;

  -- Preserved IDs make allocation repointing lossless. Reject unrelated rows
  -- occupying those IDs instead of overwriting them.
  IF EXISTS (
    SELECT 1
    FROM contractor_cost_invoices source
    JOIN vendor_invoices destination ON destination.id = source.id
    WHERE destination.tenant_id IS DISTINCT FROM source.tenant_id
       OR destination.vendor_user_id IS DISTINCT FROM source.contractor_user_id
       OR destination.vendor_invoice_number IS DISTINCT FROM source.invoice_number
  ) OR EXISTS (
    SELECT 1
    FROM contractor_cost_invoice_lines source
    JOIN vendor_invoice_lines destination ON destination.id = source.id
    WHERE destination.vendor_invoice_id IS DISTINCT FROM source.invoice_id
       OR destination.line_number IS DISTINCT FROM source.line_number
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: preserved ID collision';
  END IF;

  SELECT count(*), COALESCE(sum(total), 0)
    INTO source_invoice_count, source_invoice_total
    FROM contractor_cost_invoices;
  SELECT count(*), COALESCE(sum(amount), 0)
    INTO source_line_count, source_line_total
    FROM contractor_cost_invoice_lines;
  SELECT count(*), COALESCE(sum(allocated_amount), 0)
    INTO allocation_count_before, allocation_total_before
    FROM contractor_payment_allocations;

  IF EXISTS (
    SELECT 1
    FROM project_cost_postings
    WHERE vendor_invoice_id IN (SELECT id FROM contractor_cost_invoices)
       OR vendor_invoice_line_id IN (SELECT id FROM contractor_cost_invoice_lines)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: historical invoice already has a cost posting';
  END IF;

  INSERT INTO vendor_invoices (
    id, tenant_id, vendor_user_id, vendor_invoice_number, invoice_date,
    subtotal, tax_amount, total, description, engagement_label, project_id, status,
    approved_by, approved_at, paid_at, created_by, created_at, updated_at
  )
  SELECT
    id, tenant_id, contractor_user_id, invoice_number, invoice_date,
    total, 0, total, notes, engagement_label, project_id,
    CASE status
      WHEN 'draft' THEN 'draft'
      WHEN 'submitted' THEN 'in_review'
      WHEN 'approved' THEN 'approved'
      WHEN 'paid' THEN 'paid'
    END,
    approved_by, approved_at, paid_at, created_by, created_at, updated_at
  FROM contractor_cost_invoices
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO vendor_invoice_lines (
    id, tenant_id, vendor_invoice_id, line_number, kind, description,
    project_id, quantity, unit, unit_amount, line_amount, currency,
    reconcile_status, variance_amount, created_at, updated_at
  )
  SELECT
    line.id, invoice.tenant_id, line.invoice_id, line.line_number, line.kind,
    line.description, invoice.project_id, line.hours,
    CASE WHEN line.hours IS NULL THEN NULL ELSE 'hours' END,
    line.rate, line.amount, 'USD',
    CASE line.reconcile_status
      WHEN 'unreconciled' THEN 'unmatched'
      WHEN 'reconciled' THEN 'matched'
      WHEN 'approved' THEN 'overridden'
    END,
    CASE WHEN line.reconcile_status = 'unreconciled' THEN line.amount ELSE 0 END,
    line.created_at, line.updated_at
  FROM contractor_cost_invoice_lines line
  JOIN contractor_cost_invoices invoice ON invoice.id = line.invoice_id
  ON CONFLICT (id) DO NOTHING;

  IF (SELECT count(*) FROM vendor_invoices
      WHERE id IN (SELECT id FROM contractor_cost_invoices)) <> source_invoice_count
     OR (SELECT COALESCE(sum(total), 0) FROM vendor_invoices
         WHERE id IN (SELECT id FROM contractor_cost_invoices)) <> source_invoice_total
     OR (SELECT count(*) FROM vendor_invoice_lines
         WHERE id IN (SELECT id FROM contractor_cost_invoice_lines)) <> source_line_count
     OR (SELECT COALESCE(sum(line_amount), 0) FROM vendor_invoice_lines
         WHERE id IN (SELECT id FROM contractor_cost_invoice_lines)) <> source_line_total
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: destination count or amount mismatch';
  END IF;

  -- Validate every mapped field, not merely aggregate totals. This also makes
  -- re-running the migration safe after a lost migration-tracker record.
  IF EXISTS (
    SELECT 1
    FROM contractor_cost_invoices source
    JOIN vendor_invoices destination ON destination.id = source.id
    WHERE destination.tenant_id IS DISTINCT FROM source.tenant_id
       OR destination.vendor_user_id IS DISTINCT FROM source.contractor_user_id
       OR destination.vendor_invoice_number IS DISTINCT FROM source.invoice_number
       OR destination.invoice_date IS DISTINCT FROM source.invoice_date
       OR destination.total IS DISTINCT FROM source.total
       OR destination.project_id IS DISTINCT FROM source.project_id
       OR destination.description IS DISTINCT FROM source.notes
       OR destination.engagement_label IS DISTINCT FROM source.engagement_label
       OR destination.status IS DISTINCT FROM CASE source.status
            WHEN 'draft' THEN 'draft'
            WHEN 'submitted' THEN 'in_review'
            WHEN 'approved' THEN 'approved'
            WHEN 'paid' THEN 'paid'
          END
       OR destination.paid_at IS DISTINCT FROM source.paid_at
  ) OR EXISTS (
    SELECT 1
    FROM contractor_cost_invoice_lines source
    JOIN contractor_cost_invoices invoice ON invoice.id = source.invoice_id
    JOIN vendor_invoice_lines destination ON destination.id = source.id
    WHERE destination.tenant_id IS DISTINCT FROM invoice.tenant_id
       OR destination.vendor_invoice_id IS DISTINCT FROM source.invoice_id
       OR destination.line_number IS DISTINCT FROM source.line_number
       OR destination.kind IS DISTINCT FROM source.kind
       OR destination.description IS DISTINCT FROM source.description
       OR destination.project_id IS DISTINCT FROM invoice.project_id
       OR destination.quantity IS DISTINCT FROM source.hours
       OR destination.unit_amount IS DISTINCT FROM source.rate
       OR destination.line_amount IS DISTINCT FROM source.amount
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: mapped field mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM contractor_payment_allocations allocation
    LEFT JOIN contractor_payments payment ON payment.id = allocation.payment_id
    LEFT JOIN vendor_invoices invoice ON invoice.id = allocation.invoice_id
    WHERE invoice.id IS NULL
       OR payment.id IS NULL
       OR payment.tenant_id IS DISTINCT FROM invoice.tenant_id
       OR payment.contractor_user_id IS DISTINCT FROM invoice.vendor_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: allocation scope does not match its canonical invoice';
  END IF;

  FOR constraint_row IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = current_schema()
      AND table_name = 'contractor_payment_allocations'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name IN (
        SELECT kcu.constraint_name
        FROM information_schema.key_column_usage kcu
        WHERE kcu.table_schema = current_schema()
          AND kcu.table_name = 'contractor_payment_allocations'
          AND kcu.column_name = 'invoice_id'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE contractor_payment_allocations DROP CONSTRAINT %I',
      constraint_row.constraint_name
    );
  END LOOP;

  ALTER TABLE contractor_payment_allocations
    ADD CONSTRAINT contractor_payment_allocations_invoice_id_vendor_invoices_fk
    FOREIGN KEY (invoice_id) REFERENCES vendor_invoices(id) ON DELETE CASCADE;

  SELECT count(*), COALESCE(sum(allocated_amount), 0)
    INTO allocation_count_after, allocation_total_after
    FROM contractor_payment_allocations;
  IF allocation_count_after <> allocation_count_before
     OR allocation_total_after <> allocation_total_before
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: payment allocation totals changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM project_cost_postings
    WHERE vendor_invoice_id IN (SELECT id FROM contractor_cost_invoices)
       OR vendor_invoice_line_id IN (SELECT id FROM contractor_cost_invoice_lines)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Contractor AP cutover aborted: historical cost postings were created';
  END IF;

  -- Defense in depth: application routes are read-only after cutover, and the
  -- database rejects any accidental future writes to the retained legacy tables.
  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION reject_legacy_contractor_invoice_write()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'contractor cost invoice tables are read-only after AP cutover';
    END
    $function$
  $ddl$;
  DROP TRIGGER IF EXISTS contractor_cost_invoices_read_only
    ON contractor_cost_invoices;
  CREATE TRIGGER contractor_cost_invoices_read_only
    BEFORE INSERT OR UPDATE OR DELETE ON contractor_cost_invoices
    FOR EACH STATEMENT
    EXECUTE FUNCTION reject_legacy_contractor_invoice_write();
  DROP TRIGGER IF EXISTS contractor_cost_invoice_lines_read_only
    ON contractor_cost_invoice_lines;
  CREATE TRIGGER contractor_cost_invoice_lines_read_only
    BEFORE INSERT OR UPDATE OR DELETE ON contractor_cost_invoice_lines
    FOR EACH STATEMENT
    EXECUTE FUNCTION reject_legacy_contractor_invoice_write();

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION enforce_contractor_payment_allocation_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM contractor_payments payment
        JOIN vendor_invoices invoice
          ON invoice.id = NEW.invoice_id
         AND invoice.tenant_id = payment.tenant_id
         AND invoice.vendor_user_id = payment.contractor_user_id
        WHERE payment.id = NEW.payment_id
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'contractor payment allocation must match invoice tenant and contractor';
      END IF;
      RETURN NEW;
    END
    $function$
  $ddl$;
  DROP TRIGGER IF EXISTS contractor_payment_allocations_scope_guard
    ON contractor_payment_allocations;
  CREATE TRIGGER contractor_payment_allocations_scope_guard
    BEFORE INSERT OR UPDATE ON contractor_payment_allocations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_contractor_payment_allocation_scope();
END
$migration$;