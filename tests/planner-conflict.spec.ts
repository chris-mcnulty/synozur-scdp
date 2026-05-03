/**
 * Task #126 — Regression + unit tests for the LWW conflict resolver.
 *
 * NOTE: This project does not (currently) have a configured test runner like
 * vitest or jest. These specs are written in a runner-agnostic style: the
 * `describe`/`it` helpers are minimal local fakes that execute synchronously
 * when the file is run with `tsx` or `node --import tsx/esm`. They double as
 * living documentation for the LWW behaviour and can be promoted to a real
 * test suite later by simply removing the helper shim.
 */
import {
  resolveTaskConflict,
  mapPercentToStatus,
  mapStatusToPercent,
  classifyGraphError,
} from '../shared/planner-conflict.js';

type AnyFn = () => void | Promise<void>;
const failures: string[] = [];
let passed = 0;

function describe(name: string, fn: AnyFn) {
  console.log(`\n# ${name}`);
  Promise.resolve(fn()).catch((e) => failures.push(`${name}: ${e?.message || e}`));
}
function it(name: string, fn: AnyFn) {
  try {
    Promise.resolve(fn())
      .then(() => { passed++; console.log(`  ✓ ${name}`); })
      .catch((e) => { failures.push(`${name}: ${e?.message || e}`); console.log(`  ✗ ${name}: ${e?.message || e}`); });
  } catch (e: any) {
    failures.push(`${name}: ${e?.message || e}`);
    console.log(`  ✗ ${name}: ${e?.message || e}`);
  }
}
function expect<T>(actual: T) {
  return {
    toBe(v: T) { if (actual !== v) throw new Error(`expected ${JSON.stringify(actual)} === ${JSON.stringify(v)}`); },
    toEqual(v: T) { if (JSON.stringify(actual) !== JSON.stringify(v)) throw new Error(`expected deep eq ${JSON.stringify(actual)} === ${JSON.stringify(v)}`); },
    toContain(v: any) {
      const arr = actual as any;
      if (!arr.includes(v)) throw new Error(`expected ${JSON.stringify(actual)} to include ${JSON.stringify(v)}`);
    },
  };
}

describe('mapPercentToStatus', () => {
  it('maps 0 → open', () => expect(mapPercentToStatus(0)).toBe('open'));
  it('maps 1 → in_progress', () => expect(mapPercentToStatus(1)).toBe('in_progress'));
  it('maps 50 → in_progress', () => expect(mapPercentToStatus(50)).toBe('in_progress'));
  it('maps 100 → completed', () => expect(mapPercentToStatus(100)).toBe('completed'));
  it('maps null → open', () => expect(mapPercentToStatus(null)).toBe('open'));
});

describe('mapStatusToPercent', () => {
  it('completed → 100', () => expect(mapStatusToPercent('completed')).toBe(100));
  it('in_progress → 50', () => expect(mapStatusToPercent('in_progress')).toBe(50));
  it('open → 0', () => expect(mapStatusToPercent('open')).toBe(0));
});

describe('resolveTaskConflict — local never edited', () => {
  it('remote wins when local.lastEditedAt is null', () => {
    const r = resolveTaskConflict(
      { lastEditedAt: null, status: 'in_progress' },
      { lastModifiedDateTime: '2026-04-01T10:00:00Z', percentComplete: 100 }
    );
    expect(r.winner).toBe('remote');
    expect(r.reason).toBe('local_never_edited');
  });
});

describe('resolveTaskConflict — REGRESSION: completed→in_progress bug', () => {
  // The bug: a user marks the task COMPLETED in Planner. Constellation's local
  // status is still 'in_progress' (50%). On next outbound sync the scheduler
  // would push percentComplete=50 back to Planner, regressing remote from
  // 100 → 50. With LWW, because Planner's lastModifiedDateTime is *newer*
  // than local's lastEditedAt, remote must win.
  it('remote wins when remote.lastModified is newer than local.lastEditedAt', () => {
    const localEdit = '2026-04-01T09:00:00Z';
    const remoteEdit = '2026-04-01T10:00:00Z';
    const r = resolveTaskConflict(
      { lastEditedAt: localEdit, status: 'in_progress' },
      { lastModifiedDateTime: remoteEdit, percentComplete: 100 }
    );
    expect(r.winner).toBe('remote');
    expect(r.reason).toBe('remote_newer_than_local');
    expect(r.fields).toContain('status');
  });

  it('local wins when local.lastEditedAt is newer than remote.lastModified', () => {
    const r = resolveTaskConflict(
      { lastEditedAt: '2026-04-01T11:00:00Z', status: 'completed' },
      { lastModifiedDateTime: '2026-04-01T10:00:00Z', percentComplete: 50 }
    );
    expect(r.winner).toBe('local');
    expect(r.reason).toBe('local_newer_than_remote');
  });

  it('remote wins on exact-tie (so stale local converges to Planner)', () => {
    const t = '2026-04-01T10:00:00Z';
    const r = resolveTaskConflict(
      { lastEditedAt: t, status: 'in_progress' },
      { lastModifiedDateTime: t, percentComplete: 50 }
    );
    expect(r.winner).toBe('remote');
    expect(r.reason).toBe('timestamps_equal_remote_wins_by_default');
  });

  it('local wins when remote has no lastModifiedDateTime', () => {
    const r = resolveTaskConflict(
      { lastEditedAt: '2026-04-01T10:00:00Z', status: 'in_progress' },
      { lastModifiedDateTime: null, percentComplete: 50 }
    );
    expect(r.winner).toBe('local');
    expect(r.reason).toBe('remote_missing_timestamp');
  });
});

describe('resolveTaskConflict — fields diff detection', () => {
  it('reports status field when statuses differ', () => {
    const r = resolveTaskConflict(
      { lastEditedAt: '2026-04-01T09:00:00Z', status: 'in_progress' },
      { lastModifiedDateTime: '2026-04-01T10:00:00Z', percentComplete: 100 }
    );
    expect(r.fields).toContain('status');
  });
});

describe('classifyGraphError', () => {
  it('401 → auth_expired (not retryable)', () => {
    const c = classifyGraphError({ statusCode: 401, message: 'Unauthorized' });
    expect(c.code).toBe('auth_expired');
    expect(c.retryable).toBe(false);
  });
  it('403 → forbidden (not retryable)', () => {
    expect(classifyGraphError({ statusCode: 403 }).code).toBe('forbidden');
  });
  it('404 → plan_not_found', () => {
    expect(classifyGraphError({ statusCode: 404 }).code).toBe('plan_not_found');
  });
  it('412 → etag_mismatch (retryable)', () => {
    const c = classifyGraphError({ statusCode: 412 });
    expect(c.code).toBe('etag_mismatch');
    expect(c.retryable).toBe(true);
  });
  it('429 → rate_limited (retryable)', () => {
    const c = classifyGraphError({ statusCode: 429, headers: { 'retry-after': '7' } });
    expect(c.code).toBe('rate_limited');
    expect(c.retryAfterMs).toBe(7000);
  });
  it('503 → server (retryable)', () => {
    const c = classifyGraphError({ statusCode: 503 });
    expect(c.code).toBe('server');
    expect(c.retryable).toBe(true);
  });
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(' -', f);
    process.exit(1);
  } else {
    process.exit(0);
  }
}, 100);
