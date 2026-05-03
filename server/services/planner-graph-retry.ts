/**
 * Task #126 — Retry helpers for outbound Microsoft Graph calls.
 *
 *  - 429 / 5xx: exponential backoff (with jitter) honoring Retry-After.
 *  - 412 (etag mismatch): re-fetch the remote, re-resolve LWW, then retry once
 *    with the new etag. Caller supplies the rebuild closure.
 */
import { classifyGraphError } from '@shared/planner-conflict.js';

const MAX_BACKOFF_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;

function jitter(ms: number) {
  return ms + Math.floor(Math.random() * Math.min(250, ms / 2));
}

export async function withGraphRetry<T>(
  op: () => Promise<T>,
  opts: { label?: string } = {}
): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt < MAX_BACKOFF_ATTEMPTS) {
    try {
      return await op();
    } catch (err: any) {
      lastErr = err;
      const cls = classifyGraphError(err);
      if (!cls.retryable) throw err;
      const delay = jitter(cls.retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt));
      console.warn(`[PLANNER-RETRY] ${opts.label || 'graph'} attempt ${attempt + 1} → ${cls.code}; retry in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

/**
 * 412 etag-mismatch retry: when the first call fails with 412, the supplied
 * `rebuildAndRetry` closure runs (typically: re-fetch remote, re-run LWW,
 * regenerate the body+etag) and the result is returned.
 */
export async function withEtagRetry<T>(
  op: () => Promise<T>,
  rebuildAndRetry: () => Promise<T>,
  opts: { label?: string } = {}
): Promise<T> {
  try {
    return await withGraphRetry(op, opts);
  } catch (err: any) {
    const cls = classifyGraphError(err);
    if (cls.code === 'etag_mismatch') {
      console.warn(`[PLANNER-RETRY] ${opts.label || 'graph'} 412 etag-mismatch; re-fetching remote and retrying once`);
      return rebuildAndRetry();
    }
    throw err;
  }
}
