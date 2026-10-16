import assert from "node:assert/strict";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { assignmentImportRuns, assignmentImportRows, aiGuardrailsImportRuns } from "../shared/schema";
import { describe, it } from "./_harness";

describe("import ledger schema preservation", () => {
  it("exports all durable ledgers with the production column types and nullability", () => {
    const expected = [
      [assignmentImportRuns, "assignment_import_runs", [
        ["id", "varchar", true], ["tenant_id", "varchar", true], ["project_id", "varchar", true],
        ["package_key", "text", true], ["manifest", "jsonb", true], ["operator_reference", "text", true],
        ["created_at", "timestamp with time zone", true], ["rolled_back_at", "timestamp with time zone", false],
      ]],
      [assignmentImportRows, "assignment_import_rows", [
        ["run_id", "varchar", true], ["source_key", "text", true], ["allocation_id", "varchar", true],
        ["action", "text", true], ["before_image", "jsonb", false], ["after_image", "jsonb", true],
      ]],
      [aiGuardrailsImportRuns, "ai_guardrails_import_runs", [
        ["package_key", "text", true], ["preview_hash", "text", true], ["tenant_id", "text", true],
        ["manifest", "jsonb", true], ["after_images", "jsonb", true], ["operator_reference", "text", true],
        ["applied_at", "timestamp with time zone", true], ["rolled_back_at", "timestamp with time zone", false],
      ]],
    ] as const;
    for (const [table, name, columns] of expected) {
      const config = getTableConfig(table);
      assert.equal(config.name, name);
      assert.deepEqual(config.columns.map((c) => [c.name, c.getSQLType(), c.notNull]), columns);
    }
    const dialect = new PgDialect();
    assert.equal(dialect.sqlToQuery(assignmentImportRuns.createdAt.default as any).sql, "now()");
    assert.equal(dialect.sqlToQuery(aiGuardrailsImportRuns.appliedAt.default as any).sql, "now()");
  });

  it("keeps primary keys and uniqueness that prevent duplicate imports", () => {
    assert.equal(assignmentImportRuns.id.primary, true);
    assert.equal(aiGuardrailsImportRuns.packageKey.primary, true);
    const runs = getTableConfig(assignmentImportRuns);
    const rows = getTableConfig(assignmentImportRows);
    assert.deepEqual(runs.uniqueConstraints.map((u) => [u.name, u.columns.map((c) => c.name)]),
      [["assignment_import_runs_project_id_package_key_key", ["project_id", "package_key"]]]);
    assert.deepEqual(rows.primaryKeys.map((p) => [p.getName(), p.columns.map((c) => c.name)]),
      [["assignment_import_rows_pkey", ["run_id", "source_key"]]]);
    assert.deepEqual(rows.uniqueConstraints.map((u) => [u.name, u.columns.map((c) => c.name)]),
      [["assignment_import_rows_run_id_allocation_id_key", ["run_id", "allocation_id"]]]);
  });

  it("retains the original foreign keys without adding cascade deletion or new references", () => {
    const runs = getTableConfig(assignmentImportRuns);
    const rows = getTableConfig(assignmentImportRows);
    assert.deepEqual(runs.foreignKeys.map((f) => f.getName()).sort(),
      ["assignment_import_runs_project_id_fkey", "assignment_import_runs_tenant_id_fkey"]);
    assert.deepEqual(rows.foreignKeys.map((f) => f.getName()), ["assignment_import_rows_run_id_fkey"]);
    for (const fk of [...runs.foreignKeys, ...rows.foreignKeys]) {
      assert.equal(fk.onDelete, "no action");
      assert.equal(fk.onUpdate, "no action");
    }
    assert.equal(getTableConfig(aiGuardrailsImportRuns).foreignKeys.length, 0);
    assert.equal(rows.checks[0].name, "assignment_import_rows_action_check");
    assert.match(new PgDialect().sqlToQuery(rows.checks[0].value).sql, /IN \('insert', 'update', 'noop'\)/);
  });
});
