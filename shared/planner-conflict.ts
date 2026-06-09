/**
 * Task #126 — Planner Last-Write-Wins (LWW) conflict resolution.
 *
 * Pure function: no I/O, no side effects, no DB. Compares remote
 * `lastModifiedDateTime` from Planner (Microsoft Graph) against the local
 * `lastEditedAt` on the Constellation allocation, and decides which side wins.
 *
 * Important regression context: an earlier version of the sync code would
 * push completed→in_progress when local computed percentComplete=50 but
 * Planner already had percentComplete=100 (because the user marked it
 * complete in Planner). LWW prevents that by always letting the side with
 * the newer human edit win.
 */
export type ConflictWinner = 'local' | 'remote' | 'equal';

export interface AllocationLikeLocal {
  /** Last human edit to this allocation in Constellation. Null = never edited. */
  lastEditedAt: Date | string | null | undefined;
  /** Local-derived status (open/in_progress/completed/cancelled). */
  status?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
}

export interface PlannerTaskLikeRemote {
  /** Microsoft Graph plannerTask.lastModifiedDateTime (ISO string). */
  lastModifiedDateTime?: string | null;
  /** 0..100. */
  percentComplete?: number | null;
  startDateTime?: string | null;
  dueDateTime?: string | null;
  title?: string | null;
}

export interface ConflictResolution {
  winner: ConflictWinner;
  reason: string;
  localEditedAt: string | null;
  remoteModifiedAt: string | null;
  /** Which fields differed, if computed. */
  fields?: string[];
}

const LOCAL_NEVER_EDITED_REASON = 'local_never_edited';
const REMOTE_MISSING_TIMESTAMP_REASON = 'remote_missing_timestamp';
const REMOTE_NEWER_REASON = 'remote_newer_than_local';
const LOCAL_NEWER_REASON = 'local_newer_than_remote';
const EQUAL_REASON = 'timestamps_equal_remote_wins_by_default';

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Map Planner percentComplete to allocation status using the agreed mapping:
 *   0 → open, 1..99 → in_progress, 100 → completed.
 * Used to detect status differences for the regression test.
 */
export function mapPercentToStatus(percent: number | null | undefined): 'open' | 'in_progress' | 'completed' {
  if (percent == null) return 'open';
  if (percent >= 100) return 'completed';
  if (percent <= 0) return 'open';
  return 'in_progress';
}

export function mapStatusToPercent(status: string | null | undefined): number {
  switch (status) {
    case 'completed': return 100;
    case 'in_progress': return 50;
    case 'cancelled': return 0;
    case 'open':
    default: return 0;
  }
}

/**
 * Resolve a conflict between local and remote state using last-write-wins.
 *
 *   - If local.lastEditedAt is null/undefined → remote wins (we never had a
 *     local edit so any remote change is authoritative).
 *   - Else if remote.lastModifiedDateTime is missing → local wins (we have a
 *     real edit and Graph didn't tell us when remote changed).
 *   - Else: whichever timestamp is more recent wins. Ties → remote wins
 *     so stale local state always converges to Planner (per Task #126 spec).
 */
export function resolveTaskConflict(
  local: AllocationLikeLocal,
  remote: PlannerTaskLikeRemote
): ConflictResolution {
  const localEdited = toDate(local.lastEditedAt);
  const remoteModified = toDate(remote.lastModifiedDateTime);

  const fields: string[] = [];
  const localStatus = local.status || mapPercentToStatus(0);
  const remoteStatus = mapPercentToStatus(remote.percentComplete);
  if (localStatus !== remoteStatus) fields.push('status');
  if ((local.plannedStartDate || null) !== (remote.startDateTime ? remote.startDateTime.slice(0, 10) : null)) {
    fields.push('startDate');
  }
  if ((local.plannedEndDate || null) !== (remote.dueDateTime ? remote.dueDateTime.slice(0, 10) : null)) {
    fields.push('endDate');
  }

  const base = {
    localEditedAt: localEdited ? localEdited.toISOString() : null,
    remoteModifiedAt: remoteModified ? remoteModified.toISOString() : null,
    fields,
  };

  if (!localEdited) {
    return { winner: 'remote', reason: LOCAL_NEVER_EDITED_REASON, ...base };
  }
  if (!remoteModified) {
    return { winner: 'local', reason: REMOTE_MISSING_TIMESTAMP_REASON, ...base };
  }

  if (remoteModified.getTime() > localEdited.getTime()) {
    return { winner: 'remote', reason: REMOTE_NEWER_REASON, ...base };
  }
  if (localEdited.getTime() > remoteModified.getTime()) {
    return { winner: 'local', reason: LOCAL_NEWER_REASON, ...base };
  }
  // Equal timestamps: remote wins so stale local state converges to Planner.
  return { winner: 'remote', reason: EQUAL_REASON, ...base };
}

/**
 * Replace raw HTML error bodies (e.g. 502 gateway pages from Microsoft Graph)
 * with a clean, human-readable message so HTML markup never surfaces in the UI
 * or gets written to the database.
 *
 * The Graph SDK turns the HTML response body into `error.message`. This helper
 * is applied in every planner catch block before the message is re-thrown or stored.
 */
export function sanitizeGraphErrorMessage(msg: string): string {
  if (!msg) return msg;
  const lower = msg.toLowerCase();
  const htmlIndex = lower.indexOf('<!doctype');
  const htmlTagIndex = lower.indexOf('<html');
  const idx = htmlIndex >= 0 ? htmlIndex : htmlTagIndex;
  if (idx < 0) return msg;
  const prefix = msg.slice(0, idx).trim();
  return prefix
    ? `${prefix} — Microsoft Graph gateway error — transient, will retry`
    : 'Microsoft Graph gateway error — transient, will retry';
}

/**
 * Classify a Microsoft Graph error into a stable error code used for
 * alerting + audit. Strings only — no Error throwing here.
 */
export function classifyGraphError(err: unknown): {
  code: 'auth_expired' | 'forbidden' | 'plan_not_found' | 'rate_limited' | 'etag_mismatch' | 'network' | 'server' | 'unknown';
  retryable: boolean;
  retryAfterMs?: number;
} {
  const e = err as any;
  const status = e?.statusCode ?? e?.status ?? e?.response?.status;
  const code = e?.code ?? e?.body?.error?.code ?? e?.response?.data?.error?.code;
  const msg: string = (e?.message || '').toLowerCase();

  if (msg.includes('<!doctype') || msg.includes('<html') || msg.includes('microsoft graph gateway error')) {
    return { code: 'server', retryable: true };
  }

  if (status === 401 || code === 'InvalidAuthenticationToken' || msg.includes('expired') || msg.includes('unauthorized')) {
    return { code: 'auth_expired', retryable: false };
  }
  if (status === 403 || code === 'Forbidden' || code === 'Authorization_RequestDenied') {
    return { code: 'forbidden', retryable: false };
  }
  if (status === 404 || code === 'Request_ResourceNotFound' || msg.includes('not found') || msg.includes('does not exist')) {
    return { code: 'plan_not_found', retryable: false };
  }
  if (status === 412 || code === 'PreconditionFailed') {
    return { code: 'etag_mismatch', retryable: true };
  }
  if (status === 429) {
    const ra = Number(e?.headers?.['retry-after'] ?? e?.response?.headers?.['retry-after']);
    return { code: 'rate_limited', retryable: true, retryAfterMs: Number.isFinite(ra) ? ra * 1000 : 5000 };
  }
  if (typeof status === 'number' && status >= 500 && status < 600) {
    return { code: 'server', retryable: true };
  }
  if (e?.code === 'ECONNRESET' || e?.code === 'ETIMEDOUT' || msg.includes('network')) {
    return { code: 'network', retryable: true };
  }
  return { code: 'unknown', retryable: false };
}
