/**
 * Cache warm-up loader.
 *
 * On server startup, pre-loads frequently-accessed tenant-scoped data into the
 * in-process LRU cache so the first request after a restart doesn't pay the
 * cold-start latency tax. The keys used here mirror those in
 * `server/storage/admin.ts` and `server/storage/tenant.ts` exactly so that
 * subsequent reads through `getCached(...)` see a warm hit.
 *
 * Failures here are non-fatal: if any single tenant or query fails, the warm-up
 * logs a warning and continues with the next item. A failed warm-up should
 * never block server startup.
 */

import { db } from "../db";
import {
  tenants,
  tenantSettings,
  systemSettings,
  vocabularyCatalog,
  organizationVocabulary,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { setCached, getCacheSize } from "./cache";
import { log } from "../vite";

const TTL_SETTINGS = 5 * 60 * 1000;
const TTL_VOCAB = 5 * 60 * 1000;
const TTL_TENANT = 5 * 60 * 1000;

export interface WarmupResult {
  tenantsLoaded: number;
  systemSettingsLoaded: number;
  vocabCatalogLoaded: number;
  orgVocabLoaded: number;
  tenantSettingsLoaded: number;
  durationMs: number;
  errors: string[];
}

export async function warmCache(): Promise<WarmupResult> {
  const started = Date.now();
  const result: WarmupResult = {
    tenantsLoaded: 0,
    systemSettingsLoaded: 0,
    vocabCatalogLoaded: 0,
    orgVocabLoaded: 0,
    tenantSettingsLoaded: 0,
    durationMs: 0,
    errors: [],
  };

  // 1. System settings (global, tenant-independent)
  try {
    const allSettings = await db.select().from(systemSettings)
      .orderBy(systemSettings.settingKey);
    setCached("system_settings:all", TTL_SETTINGS, allSettings);
    for (const s of allSettings) {
      setCached(`system_settings:${s.settingKey}`, TTL_SETTINGS, s);
    }
    result.systemSettingsLoaded = allSettings.length;
  } catch (err: any) {
    result.errors.push(`system_settings: ${err.message}`);
  }

  // 2. Vocabulary catalog (active terms, plus per-type buckets)
  try {
    const activeTerms = await db.select()
      .from(vocabularyCatalog)
      .where(eq(vocabularyCatalog.isActive, true));
    // Mirror the orderBy semantics of getVocabularyCatalog: termType, sortOrder
    const allSorted = [...activeTerms].sort((a, b) => {
      if (a.termType !== b.termType) return a.termType.localeCompare(b.termType);
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
    setCached("vocab_catalog:all", TTL_VOCAB, allSorted);

    const byType = new Map<string, typeof activeTerms>();
    for (const term of activeTerms) {
      const arr = byType.get(term.termType) ?? [];
      arr.push(term);
      byType.set(term.termType, arr);
    }
    for (const [termType, terms] of Array.from(byType.entries())) {
      const sorted = [...terms].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      );
      setCached(`vocab_catalog:type:${termType}`, TTL_VOCAB, sorted);
    }
    result.vocabCatalogLoaded = activeTerms.length;
  } catch (err: any) {
    result.errors.push(`vocab_catalog: ${err.message}`);
  }

  // 3. Tenants — full list, individual tenant rows, and per-tenant org vocab.
  try {
    const allTenants = await db.select().from(tenants);
    setCached("tenants:all", TTL_TENANT, allTenants);
    for (const t of allTenants) {
      setCached(`tenant:${t.id}`, TTL_TENANT, t);
    }
    result.tenantsLoaded = allTenants.length;

    // Treat tenants whose plan is not explicitly cancelled/expired as active.
    const activeTenants = allTenants.filter(
      (t) => !t.planStatus || t.planStatus === "active" || t.planStatus === "trial",
    );

    if (activeTenants.length > 0) {
      // Pull all org_vocab rows in one query, then fan out into per-tenant cache keys.
      const orgVocabRows = await db.select().from(organizationVocabulary);
      const byTenant = new Map<string, typeof orgVocabRows[number]>();
      for (const row of orgVocabRows) {
        if (row.tenantId) byTenant.set(row.tenantId, row);
      }
      for (const t of activeTenants) {
        const row = byTenant.get(t.id);
        // Cache the value (or undefined) so the next read is a hit either way.
        setCached(`org_vocab:${t.id}`, TTL_VOCAB, row);
        if (row) result.orgVocabLoaded++;
      }

      // 4. Tenant-scoped settings — single bulk query for all active tenants,
      //    then fan out into per-(tenant,key) cache keys matching the layout
      //    used by getTenantSetting() in server/storage/admin.ts.
      try {
        const activeIds = activeTenants.map((t) => t.id);
        const tSettings = await db.select().from(tenantSettings)
          .where(inArray(tenantSettings.tenantId, activeIds));
        for (const row of tSettings) {
          setCached(
            `tenant_settings:${row.tenantId}:${row.settingKey}`,
            TTL_SETTINGS,
            row,
          );
        }
        result.tenantSettingsLoaded = tSettings.length;
      } catch (err: any) {
        result.errors.push(`tenant_settings: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(`tenants: ${err.message}`);
  }

  result.durationMs = Date.now() - started;

  log(
    `🔥 Cache warm-up complete in ${result.durationMs}ms: ` +
      `${result.tenantsLoaded} tenants, ` +
      `${result.systemSettingsLoaded} system settings, ` +
      `${result.tenantSettingsLoaded} tenant settings, ` +
      `${result.vocabCatalogLoaded} vocab terms, ` +
      `${result.orgVocabLoaded} tenant vocab selections, ` +
      `cache size=${getCacheSize()}` +
      (result.errors.length > 0 ? ` (errors: ${result.errors.join("; ")})` : ""),
  );

  return result;
}
