/**
 * Agent Card Health Scheduler
 *
 * Runs a periodic check of the A2A agent card by polling the live
 * /mcp/agent-card-health endpoint. The check interval defaults to 1 hour
 * and is configurable via the AGENT_CARD_HEALTH_CHECK_INTERVAL_HOURS
 * environment variable. Sends an email alert to platform admins when the
 * card is invalid.
 *
 * Deduplication / cooldown rules:
 *   - An initial alert is sent as soon as the card first fails.
 *   - Subsequent alerts are suppressed for the configured cooldown period (AGENT_CARD_ALERT_COOLDOWN_HOURS system setting, default 24h).
 *   - After the cooldown period of continued failure a "still failing" reminder is sent
 *     and the cooldown window resets.
 *   - When the card recovers the state is cleared so the next failure triggers
 *     a fresh initial alert.
 *   - State is persisted in system_settings so cooldowns survive server restarts.
 */

import * as cron from 'node-cron';
import { getUncachableSendGridClient } from './sendgrid-client.js';
import { storage } from '../storage.js';
import type { InsertAgentCardHealthCheck } from '../../shared/schema.js';

const SCHEDULER_TAG = '[AGENT-CARD-HEALTH]';
const PORT = process.env.PORT || '5000';
const HEALTH_ENDPOINT = `http://localhost:${PORT}/mcp/agent-card-health`;

const SETTING_FAILING_SINCE = 'AGENT_CARD_FAILING_SINCE';
const SETTING_LAST_ALERT_SENT_AT = 'AGENT_CARD_LAST_ALERT_SENT_AT';
const DEFAULT_ALERT_COOLDOWN_HOURS = 24;
export const ALERT_COOLDOWN_MS = DEFAULT_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000;
export const REMINDER_INTERVAL_MS = ALERT_COOLDOWN_MS; // alias for external consumers

// Module-level cache — loaded from DB on first check, kept in sync after that.
let failingSince: string | null = null;
let lastAlertSentAt: string | null = null;
let stateLoaded = false;
let lastResult: AgentCardHealthResult | null = null;

export function getFailingSince(): string | null {
  return failingSince;
}

export function getLastAlertSentAt(): string | null {
  return lastAlertSentAt;
}

async function getAlertCooldownMs(): Promise<number> {
  try {
    const value = await storage.getSystemSettingValue('AGENT_CARD_ALERT_COOLDOWN_HOURS', String(DEFAULT_ALERT_COOLDOWN_HOURS));
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed * 60 * 60 * 1000;
    }
  } catch (err) {
    console.warn(`${SCHEDULER_TAG} Failed to read AGENT_CARD_ALERT_COOLDOWN_HOURS from settings, using default:`, err);
  }
  return DEFAULT_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000;
}

export interface AgentCardHealthResult {
  status: 'ok' | 'invalid' | 'error';
  checkedAt: string;
  skillCount?: number;
  errors?: string[];
  message?: string;
}

const HISTORY_MAX = 10;
let history: AgentCardHealthResult[] = [];

export function getLastHealthCheckResult(): AgentCardHealthResult | null {
  return lastResult;
}

export function getLastAgentCardHealthResult(): AgentCardHealthResult | null {
  return lastResult;
}

export function getAgentCardHealthHistory(): AgentCardHealthResult[] {
  return history;
}

function appendToHistory(result: AgentCardHealthResult): void {
  history.push(result);
  if (history.length > HISTORY_MAX) {
    history = history.slice(history.length - HISTORY_MAX);
  }
}


async function loadPersistedState(): Promise<void> {
  if (stateLoaded) return;
  try {
    const fs = await storage.getSystemSettingValue(SETTING_FAILING_SINCE, '');
    const la = await storage.getSystemSettingValue(SETTING_LAST_ALERT_SENT_AT, '');
    failingSince = fs || null;
    lastAlertSentAt = la || null;
    stateLoaded = true;
    console.log(
      `${SCHEDULER_TAG} Loaded persisted alert state — failingSince=${failingSince ?? 'none'}, lastAlertSentAt=${lastAlertSentAt ?? 'none'}`,
    );
  } catch (err) {
    console.error(`${SCHEDULER_TAG} Failed to load persisted alert state:`, err);
    stateLoaded = true; // don't retry on every check
  }
}

async function persistState(): Promise<void> {
  try {
    await storage.setSystemSetting(
      SETTING_FAILING_SINCE,
      failingSince ?? '',
      'ISO timestamp when the agent card first started failing (empty = currently healthy)',
      'string',
    );
    await storage.setSystemSetting(
      SETTING_LAST_ALERT_SENT_AT,
      lastAlertSentAt ?? '',
      'ISO timestamp of the last agent card health alert email sent to admins',
      'string',
    );
  } catch (err) {
    console.error(`${SCHEDULER_TAG} Failed to persist alert state:`, err);
  }
}

export async function runAgentCardHealthCheck(trigger: string = 'scheduled'): Promise<AgentCardHealthResult> {
  console.log(`${SCHEDULER_TAG} Running agent card health check (trigger: ${trigger}) via ${HEALTH_ENDPOINT}...`);

  await loadPersistedState();

  const fallbackTimestamp = new Date().toISOString();
  let result: AgentCardHealthResult;

  try {
    const response = await fetch(HEALTH_ENDPOINT);
    const body = await response.json() as Partial<AgentCardHealthResult>;

    const normalised: AgentCardHealthResult = {
      status: (body.status as AgentCardHealthResult['status']) || 'error',
      checkedAt: body.checkedAt || fallbackTimestamp,
      skillCount: body.skillCount,
      errors: body.errors,
      message: body.message,
    };

    if (response.ok && normalised.status === 'ok') {
      console.log(`${SCHEDULER_TAG} Agent card is valid (${normalised.skillCount ?? 0} skills).`);

      // Clear failure state if the card has recovered.
      if (failingSince !== null || lastAlertSentAt !== null) {
        console.log(`${SCHEDULER_TAG} Agent card has recovered. Clearing persisted alert state.`);
        failingSince = null;
        lastAlertSentAt = null;
        await persistState();
      }
      lastResult = normalised;
      appendToHistory(normalised);

      // Persist successful result to the database for history
      try {
        await storage.addAgentCardHealthCheck({
          status: normalised.status,
          checkedAt: new Date(normalised.checkedAt),
          skillCount: normalised.skillCount ?? null,
          errors: null,
          message: null,
          trigger,
        } as InsertAgentCardHealthCheck);
      } catch (persistErr) {
        console.error(`${SCHEDULER_TAG} Failed to persist health check result:`, persistErr);
      }

      return normalised;
    }

    result = normalised;
    console.warn(
      `${SCHEDULER_TAG} Agent card health check returned status "${normalised.status}" (HTTP ${response.status}).`,
      normalised.errors ?? normalised.message,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${SCHEDULER_TAG} HTTP request to health endpoint failed:`, error);
    result = {
      status: 'error',
      checkedAt: fallbackTimestamp,
      message: `Failed to reach ${HEALTH_ENDPOINT}: ${message}`,
    };
  }

  lastResult = result;
  appendToHistory(result);

  // Persist every result to the database for history
  try {
    await storage.addAgentCardHealthCheck({
      status: result.status,
      checkedAt: new Date(result.checkedAt),
      skillCount: result.skillCount ?? null,
      errors: result.errors ?? null,
      message: result.message ?? null,
      trigger,
    } as InsertAgentCardHealthCheck);
  } catch (persistErr) {
    console.error(`${SCHEDULER_TAG} Failed to persist health check result:`, persistErr);
  }

  const now = new Date().toISOString();

  // First failure — record when it started.
  if (failingSince === null) {
    failingSince = now;
    console.log(`${SCHEDULER_TAG} Card entered failing state — failingSince set to ${failingSince}`);
  }

  // Enforce configurable cooldown between alert emails.
  const cooldownMs = await getAlertCooldownMs();
  const cooldownHours = cooldownMs / 3_600_000;
  const isFirstAlert = lastAlertSentAt === null;
  const shouldAlert =
    isFirstAlert ||
    Date.now() - new Date(lastAlertSentAt!).getTime() >= cooldownMs;

  if (shouldAlert) {
    try {
      await sendAdminAlert(result, !isFirstAlert, cooldownHours);
      lastAlertSentAt = now;
      console.log(`${SCHEDULER_TAG} Alert sent (isReminder=${!isFirstAlert}). Next alert suppressed for ${cooldownHours}h.`);
    } catch (alertError: unknown) {
      console.error(`${SCHEDULER_TAG} sendAdminAlert threw unexpectedly:`, alertError);
    }
  } else {
    const nextAlertAt = new Date(new Date(lastAlertSentAt!).getTime() + cooldownMs).toISOString();
    console.log(
      `${SCHEDULER_TAG} Alert suppressed — cooldown active. Next alert eligible at ${nextAlertAt}. Errors: ${(result.errors ?? [result.message ?? 'unknown']).join('; ')}`
    );
  }

  await persistState();

  return result;
}

async function sendAdminAlert(result: AgentCardHealthResult, isReminder: boolean, cooldownHours: number = DEFAULT_ALERT_COOLDOWN_HOURS): Promise<void> {
  let adminEmails: string[] = [];

  try {
    adminEmails = await storage.getPlatformAdminEmails();
  } catch (err) {
    console.error(`${SCHEDULER_TAG} Failed to retrieve platform admin emails:`, err);
  }

  if (adminEmails.length === 0) {
    console.warn(`${SCHEDULER_TAG} No platform admin emails found — alert not sent.`);
    return;
  }

  const reminderPrefix = isReminder ? ' (Reminder — Still Failing)' : '';
  const subject =
    result.status === 'invalid'
      ? `[Constellation] Agent Card Health Check Failed${reminderPrefix} — Validation Errors Detected`
      : `[Constellation] Agent Card Health Check Error${reminderPrefix} — Endpoint Unreachable or Failed`;

  const safeCheckedAt = result.checkedAt || new Date().toISOString();
  const safeMessage = result.message || 'Unknown error';

  const errorList =
    result.errors && result.errors.length > 0
      ? `<ul style="margin:12px 0; padding-left:20px;">${result.errors.map(e => `<li style="margin:4px 0;">${escapeHtml(e)}</li>`).join('')}</ul>`
      : '';

  const cooldownLabel = cooldownHours === 1 ? '1 hour' : `${cooldownHours} hours`;
  const reminderBanner = isReminder
    ? `<p style="background:#fef3c7;padding:10px 14px;border-left:4px solid #f59e0b;margin:0 0 16px 0;">
        <strong>This is a reminder.</strong> The agent card has been in a failed state since
        <strong>${escapeHtml(failingSince ?? 'unknown')}</strong>.
        Alerts are sent once per ${cooldownLabel} window while the issue persists.
      </p>`
    : '';

  const failingSinceNote = failingSince
    ? `<p><strong>Failing since:</strong> ${escapeHtml(failingSince)}</p>`
    : '';

  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="color: #b91c1c; border-bottom: 2px solid #fca5a5; padding-bottom: 8px;">
        ⚠️ Agent Card Health Check ${result.status === 'invalid' ? 'Failed' : 'Error'}
      </h2>
      ${reminderBanner}
      <p>The scheduled agent card health check detected a problem at <strong>${escapeHtml(safeCheckedAt)}</strong>.</p>
      ${failingSinceNote}
      ${result.status === 'invalid' ? `
        <p><strong>Status:</strong> <span style="color:#b91c1c;">Invalid</span></p>
        <p><strong>Validation errors detected at <code>/mcp/agent-card-health</code>:</strong></p>
        ${errorList}
        <p>These errors indicate that the agent card does not pass validation. Copilot Studio and other A2A clients may fail to connect until these issues are resolved.</p>
      ` : `
        <p><strong>Status:</strong> <span style="color:#b91c1c;">Error</span></p>
        <p><strong>Error:</strong> ${escapeHtml(safeMessage)}</p>
        <p>An unexpected error occurred when polling <code>/mcp/agent-card-health</code>. Please review the server logs for details.</p>
      `}
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">
        This is an automated alert from the Constellation platform scheduler.
        Alerts are sent once per failure event and then at most once every ${cooldownLabel} while the issue persists.
        Once the issue is resolved and the next hourly check passes, the alert state will be cleared automatically.
      </p>
    </div>
  `;

  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    await Promise.all(
      adminEmails.map(email =>
        client.send({
          to: email,
          from: { email: fromEmail, name: 'Constellation (SCDP)' },
          subject,
          html: body,
        })
      )
    );

    console.log(`${SCHEDULER_TAG} Alert email sent to ${adminEmails.length} admin(s): ${adminEmails.join(', ')}`);
  } catch (err) {
    console.error(`${SCHEDULER_TAG} Failed to send alert email via SendGrid:`, err);
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'\/]/g, c => map[c] || c);
}

/**
 * Returns the configured check interval in whole hours.
 * Reads AGENT_CARD_HEALTH_CHECK_INTERVAL_HOURS (default 1, clamped 1–168).
 * Exposed so the admin API / UI can surface the active interval.
 */
export function getSchedulerIntervalHours(): number {
  const raw = parseInt(process.env.AGENT_CARD_HEALTH_CHECK_INTERVAL_HOURS ?? '1', 10);
  if (isNaN(raw) || raw < 1) return 1;
  if (raw > 168) return 168; // cap at one week
  return raw;
}

// Builds a cron expression that fires every N hours (on the hour).
// e.g. intervalHours=1  -> "0 * * * *"
//      intervalHours=6  -> "0 */6 * * *"
//      intervalHours=24 -> "0 0 * * *"
function buildCronExpression(intervalHours: number): string {
  if (intervalHours === 1) return '0 * * * *';
  if (intervalHours === 24) return '0 0 * * *';
  return `0 */${intervalHours} * * *`;
}

export async function startAgentCardHealthScheduler(): Promise<void> {
  const intervalHours = getSchedulerIntervalHours();
  const cronExpr = buildCronExpression(intervalHours);

  console.log(`${SCHEDULER_TAG} Starting agent card health scheduler (interval: every ${intervalHours}h, cron: "${cronExpr}")...`);

  cron.schedule(cronExpr, async () => {
    console.log(`${SCHEDULER_TAG} Scheduled check triggered (every ${intervalHours}h)`);
    try {
      await runAgentCardHealthCheck('cron');
    } catch (err) {
      console.error(`${SCHEDULER_TAG} Unhandled error in scheduled cron run:`, err);
    }
  });

  console.log(
    `${SCHEDULER_TAG} Scheduler started — runs every ${intervalHours} hour(s) ` +
    `(cron: "${cronExpr}", alert cooldown configurable via AGENT_CARD_ALERT_COOLDOWN_HOURS system setting, state persisted across restarts). ` +
    `Set AGENT_CARD_HEALTH_CHECK_INTERVAL_HOURS to change the check interval.`
  );

  setTimeout(async () => {
    console.log(`${SCHEDULER_TAG} Running immediate startup health check...`);
    try {
      await runAgentCardHealthCheck('startup');
    } catch (err) {
      console.error(`${SCHEDULER_TAG} Unhandled error in startup health check:`, err);
    }
  }, 10000);
}
