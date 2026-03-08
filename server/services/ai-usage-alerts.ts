import { storage } from "../storage.js";
import { emailService } from "./email-notification.js";

const ALERT_CHECK_DEBOUNCE_MS = 60_000;
let lastAlertCheckTime = 0;

function getCurrentPeriodMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function checkUsageThresholds(): Promise<void> {
  const now = Date.now();
  if (now - lastAlertCheckTime < ALERT_CHECK_DEBOUNCE_MS) {
    return;
  }
  lastAlertCheckTime = now;

  try {
    const config = await storage.getAiConfiguration();
    if (!config) return;

    const budget = config.monthlyTokenBudget;
    if (!budget || budget <= 0) return;
    if (config.alertEnabled === false) return;

    const thresholds: number[] = (config.alertThresholds as number[] | null) ?? [75, 90, 100];
    if (thresholds.length === 0) return;

    const periodMonth = getCurrentPeriodMonth();
    const currentUsage = await storage.getMonthlyTokenTotal(periodMonth);
    const usagePercent = (currentUsage / budget) * 100;

    const sortedThresholds = [...thresholds].sort((a, b) => a - b);

    for (const threshold of sortedThresholds) {
      if (usagePercent < threshold) break;

      const existingAlert = await storage.getAiUsageAlert(periodMonth, threshold);
      if (existingAlert) continue;

      const adminEmails = await storage.getPlatformAdminEmails();
      if (adminEmails.length === 0) {
        console.warn('[AI_ALERTS] No platform admin emails found for alert notification');
        continue;
      }

      await storage.createAiUsageAlert({
        periodMonth,
        thresholdPercent: threshold,
        tokenUsageAtAlert: currentUsage,
        monthlyBudget: budget,
        notifiedEmails: adminEmails,
      });

      const formattedUsage = currentUsage.toLocaleString();
      const formattedBudget = budget.toLocaleString();
      const formattedPercent = usagePercent.toFixed(1);

      const subject = threshold >= 100
        ? `⚠️ AI Token Budget Exceeded (${formattedPercent}%)`
        : `AI Token Usage Alert: ${threshold}% of Monthly Budget Reached`;

      const urgencyColor = threshold >= 100 ? '#DC2626' : threshold >= 90 ? '#F59E0B' : '#7C3AED';

      const body = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: ${urgencyColor};">AI Token Usage Alert</h2>
            <p>Constellation's AI token usage has reached <strong>${formattedPercent}%</strong> of the monthly budget.</p>
            <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid ${urgencyColor}; margin: 20px 0;">
              <strong>Current Usage:</strong> ${formattedUsage} tokens<br>
              <strong>Monthly Budget:</strong> ${formattedBudget} tokens<br>
              <strong>Threshold:</strong> ${threshold}%<br>
              <strong>Period:</strong> ${periodMonth}
            </div>
            ${threshold >= 100
              ? '<p style="color: #DC2626;"><strong>The monthly token budget has been exceeded.</strong> Consider increasing the budget or reviewing usage patterns in AI Settings.</p>'
              : '<p>You can review usage details and adjust the budget in the AI Settings page.</p>'
            }
            <p style="color: #999; font-size: 12px;">This is an automated alert from Constellation. You can manage alert thresholds in AI Settings.</p>
          </body>
        </html>
      `;

      for (const email of adminEmails) {
        await emailService.sendEmail({
          to: { email, name: 'Platform Admin' },
          subject,
          body,
        });
      }

      console.log(`[AI_ALERTS] Sent ${threshold}% threshold alert for ${periodMonth} to ${adminEmails.length} admin(s). Usage: ${formattedUsage}/${formattedBudget} tokens`);
    }
  } catch (error) {
    console.error('[AI_ALERTS] Error checking usage thresholds (non-blocking):', error);
  }
}
