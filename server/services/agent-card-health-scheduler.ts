/**
 * Agent Card Health Scheduler
 *
 * Runs an hourly check of the A2A agent card by polling the live
 * /mcp/agent-card-health endpoint. Sends an email alert to platform
 * admins when the card is invalid.
 *
 * Deduplication / cooldown rules:
 *   - An initial alert is sent as soon as the card first fails.
 *   - Subsequent alerts are suppressed for 24 hours (REMINDER_INTERVAL_MS).
 *   - After 24 hours of continued failure a "still failing" reminder is sent
 *     and the 24-hour window resets.
 *   - When the card recovers the state is cleared so the next failure triggers
 *     a fresh initial alert.
 */

import * as cron from 'node-cron';
import { getUncachableSendGridClient } from './sendgrid-client.js';
import { storage } from '../storage.js';

const SCHEDULER_TAG = '[AGENT-CARD-HEALTH]';
const PORT = process.env.PORT || '5000';
const HEALTH_ENDPOINT = `http://localhost:${PORT}/mcp/agent-card-health`;

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

let failingSince: Date | null = null;
let lastAlertSentAt: Date | null = null;

function resetAlertState() {
  failingSince = null;
  lastAlertSentAt = null;
}

export interface AgentCardHealthResult {
  status: 'ok' | 'invalid' | 'error';
  checkedAt: string;
  skillCount?: number;
  errors?: string[];
  message?: string;
}

export async function runAgentCardHealthCheck(trigger: string = 'scheduled'): Promise<AgentCardHealthResult> {
  console.log(`${SCHEDULER_TAG} Running agent card health check (trigger: ${trigger}) via ${HEALTH_ENDPOINT}...`);

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
      if (failingSince !== null) {
        console.log(`${SCHEDULER_TAG} Agent card has recovered. Clearing alert state.`);
        resetAlertState();
      } else {
        console.log(`${SCHEDULER_TAG} Agent card is valid (${normalised.skillCount ?? 0} skills).`);
      }
      return normalised;
    }

    result = normalised;
    console.warn(`${SCHEDULER_TAG} Agent card health check returned status "${normalised.status}" (HTTP ${response.status}).`, normalised.errors ?? normalised.message);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${SCHEDULER_TAG} HTTP request to health endpoint failed:`, error);
    result = {
      status: 'error',
      checkedAt: fallbackTimestamp,
      message: `Failed to reach ${HEALTH_ENDPOINT}: ${message}`,
    };
  }

  const now = new Date();

  if (lastAlertSentAt === null) {
    failingSince = now;
    lastAlertSentAt = now;
    try {
      await sendAdminAlert(result, false);
    } catch (alertError: unknown) {
      console.error(`${SCHEDULER_TAG} sendAdminAlert threw unexpectedly:`, alertError);
    }
    return result;
  }

  const msSinceLastAlert = now.getTime() - lastAlertSentAt.getTime();

  if (msSinceLastAlert < REMINDER_INTERVAL_MS) {
    console.log(
      `${SCHEDULER_TAG} Alert suppressed (cooldown). Last alert was ${Math.round(msSinceLastAlert / 60_000)} min ago. Errors: ${(result.errors ?? [result.message ?? 'unknown']).join('; ')}`
    );
    return result;
  }

  lastAlertSentAt = now;
  try {
    await sendAdminAlert(result, true);
  } catch (alertError: unknown) {
    console.error(`${SCHEDULER_TAG} sendAdminAlert threw unexpectedly:`, alertError);
  }
  return result;
}

async function sendAdminAlert(result: AgentCardHealthResult, isReminder: boolean): Promise<void> {
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

  const reminderBanner = isReminder
    ? `<p style="background:#fef3c7;padding:10px 14px;border-left:4px solid #f59e0b;margin:0 0 16px 0;">
        <strong>This is a reminder.</strong> The agent card has been in a failed state since
        <strong>${escapeHtml(failingSince?.toUTCString() ?? 'unknown')}</strong>.
        Alerts are sent once per 24-hour window while the issue persists.
      </p>`
    : '';

  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="color: #b91c1c; border-bottom: 2px solid #fca5a5; padding-bottom: 8px;">
        ⚠️ Agent Card Health Check ${result.status === 'invalid' ? 'Failed' : 'Error'}
      </h2>
      ${reminderBanner}
      <p>The scheduled agent card health check detected a problem at <strong>${escapeHtml(safeCheckedAt)}</strong>.</p>
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
        Alerts are sent once per failure event and then at most once every 24 hours while the issue persists.
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

    console.log(`${SCHEDULER_TAG} ${isReminder ? 'Reminder' : 'Initial'} alert email sent to ${adminEmails.length} admin(s): ${adminEmails.join(', ')}`);
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

export async function startAgentCardHealthScheduler(): Promise<void> {
  console.log(`${SCHEDULER_TAG} Starting agent card health scheduler...`);

  cron.schedule('0 * * * *', async () => {
    console.log(`${SCHEDULER_TAG} Hourly check triggered`);
    try {
      await runAgentCardHealthCheck('cron');
    } catch (err) {
      console.error(`${SCHEDULER_TAG} Unhandled error in hourly cron run:`, err);
    }
  });

  console.log(`${SCHEDULER_TAG} Scheduler started — runs every hour on the hour (24h cooldown between repeat alerts)`);

  setTimeout(async () => {
    console.log(`${SCHEDULER_TAG} Running immediate startup health check...`);
    try {
      await runAgentCardHealthCheck('startup');
    } catch (err) {
      console.error(`${SCHEDULER_TAG} Unhandled error in startup health check:`, err);
    }
  }, 10000);
}
