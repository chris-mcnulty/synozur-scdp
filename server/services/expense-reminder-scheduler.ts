import * as cron from 'node-cron';
import { storage } from '../storage.js';
import { EmailNotificationService } from './email-notification.js';

const emailService = new EmailNotificationService();

interface ExpenseReminderRecipient {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  unsubmittedExpenseCount: number;
}

interface TenantSchedule {
  tenantId: string;
  tenantName: string;
  time: string;
  day: number;
  timezone: string;
}

function escapeHtml(text: string): string {
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };
  return text.replace(/[&<>"'\/]/g, (char) => htmlEscapeMap[char] || char);
}

async function getUsersWithUnsubmittedExpenses(tenantId: string): Promise<ExpenseReminderRecipient[]> {
  const recipients: ExpenseReminderRecipient[] = [];
  
  const users = await storage.getUsers();
  const tenantUsers = users.filter(u => 
    u.isActive && 
    u.email && 
    u.canLogin &&
    u.primaryTenantId === tenantId &&
    (u as any).receiveExpenseReminders !== false
  );

  const expenseIdsInReports = await storage.getExpenseIdsInReports();

  for (const user of tenantUsers) {
    const expenses = await storage.getExpenses({ personId: user.id });
    
    // Filter to only expenses that belong to this tenant AND are not in any expense report
    // The key criteria is: expense is NOT associated with any expense report (regardless of approvalStatus)
    const unsubmittedExpenses = expenses.filter(exp => 
      (exp as any).tenantId === tenantId && // Tenant isolation
      !expenseIdsInReports.has(exp.id) // Not in any expense report
    );
    
    if (unsubmittedExpenses.length > 0) {
      recipients.push({
        userId: user.id,
        email: user.email!,
        name: user.name,
        tenantId: tenantId,
        unsubmittedExpenseCount: unsubmittedExpenses.length
      });
    }
  }

  return recipients;
}

async function sendExpenseReminderEmail(
  recipient: ExpenseReminderRecipient, 
  appUrl: string,
  branding?: { emailHeaderUrl?: string | null; companyName?: string }
): Promise<void> {
  const headerHtml = branding?.emailHeaderUrl 
    ? `<img src="${branding.emailHeaderUrl}" alt="${escapeHtml(branding.companyName || 'Company')}" style="max-width: 100%; height: auto; margin-bottom: 20px;" />`
    : '';

  const count = recipient.unsubmittedExpenseCount;
  const subject = `Expense Reminder: ${count} expense${count === 1 ? '' : 's'} pending submission`;
  const body = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        ${headerHtml}
        <h2 style="color: #7C3AED;">Expense Submission Reminder</h2>
        <p>Hi ${escapeHtml(recipient.name)},</p>
        <p>This is a friendly reminder that you have <strong>${count} expense${count === 1 ? '' : 's'}</strong> that ${count === 1 ? 'has' : 'have'} not been added to an expense report for approval.</p>
        <p style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
          To get reimbursed, please add your expenses to an expense report and submit it for approval.
        </p>
        <p>
          <a href="${appUrl}/expenses" style="display: inline-block; background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0;">
            Review My Expenses
          </a>
        </p>
        <p style="color: #666; font-size: 0.9em; margin-top: 30px;">
          You can disable these reminders in your personal settings if you prefer not to receive them.
        </p>
        <p>Thank you,<br>${branding?.companyName || 'Synozur Consulting Delivery Platform'}</p>
      </body>
    </html>
  `;

  await emailService.sendEmail({
    to: { email: recipient.email, name: recipient.name },
    subject,
    body
  });
}

export async function runExpenseRemindersForTenant(
  tenantId: string, 
  triggeredBy: 'scheduled' | 'manual' | 'catchup' = 'scheduled',
  triggeredByUserId?: string
): Promise<{ sent: number; skipped: number; errors: number }> {
  console.log(`[EXPENSE-REMINDERS] Running reminders for tenant ${tenantId}...`);
  
  // Create job run record
  const jobRun = await storage.createScheduledJobRun({
    tenantId,
    jobType: 'expense_reminder',
    status: 'running',
    triggeredBy,
    triggeredByUserId: triggeredByUserId || null,
  });
  
  try {
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      console.log(`[EXPENSE-REMINDERS] Tenant ${tenantId} not found. Skipping.`);
      await storage.updateScheduledJobRun(jobRun.id, {
        status: 'completed',
        completedAt: new Date(),
        resultSummary: { sent: 0, skipped: 0, errors: 0, reason: 'Tenant not found' },
      });
      return { sent: 0, skipped: 0, errors: 0 };
    }

    if (!tenant.expenseRemindersEnabled) {
      console.log(`[EXPENSE-REMINDERS] Expense reminders disabled for tenant ${tenant.name}. Skipping.`);
      await storage.updateScheduledJobRun(jobRun.id, {
        status: 'completed',
        completedAt: new Date(),
        resultSummary: { sent: 0, skipped: 0, errors: 0, reason: 'Reminders disabled' },
      });
      return { sent: 0, skipped: 0, errors: 0 };
    }

    const appUrl = process.env.APP_URL 
      || (process.env.REPLIT_DEPLOYMENT === '1' ? 'https://scdp.synozur.com' : null)
      || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : null)
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
      || 'https://scdp.synozur.com';

    const branding = { 
      emailHeaderUrl: tenant.emailHeaderUrl, 
      companyName: tenant.name 
    };

    const recipients = await getUsersWithUnsubmittedExpenses(tenantId);
    console.log(`[EXPENSE-REMINDERS] Found ${recipients.length} users to remind for tenant ${tenant.name}`);

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const recipient of recipients) {
      try {
        await sendExpenseReminderEmail(recipient, appUrl, branding);
        sent++;
        console.log(`[EXPENSE-REMINDERS] Sent reminder to ${recipient.email}`);
      } catch (error) {
        errors++;
        console.error(`[EXPENSE-REMINDERS] Failed to send reminder to ${recipient.email}:`, error);
      }
    }

    console.log(`[EXPENSE-REMINDERS] Completed for ${tenant.name}: ${sent} sent, ${skipped} skipped, ${errors} errors`);
    
    // Update job run with results
    await storage.updateScheduledJobRun(jobRun.id, {
      status: errors > 0 && sent === 0 ? 'failed' : 'completed',
      completedAt: new Date(),
      resultSummary: { sent, skipped, errors, recipientCount: recipients.length },
    });
    
    return { sent, skipped, errors };
  } catch (error: any) {
    console.error(`[EXPENSE-REMINDERS] Job failed for tenant ${tenantId}:`, error);
    await storage.updateScheduledJobRun(jobRun.id, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: error.message || 'Unknown error',
    });
    return { sent: 0, skipped: 0, errors: 1 };
  }
}

const scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

function getCronExpression(time: string, day: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  return `${minutes} ${hours} * * ${day}`;
}

async function scheduleForTenant(tenant: TenantSchedule): Promise<void> {
  const existingTask = scheduledTasks.get(tenant.tenantId);
  if (existingTask) {
    existingTask.stop();
    scheduledTasks.delete(tenant.tenantId);
  }

  const cronExpression = getCronExpression(tenant.time, tenant.day);
  
  console.log(`[EXPENSE-REMINDERS] Scheduling for tenant ${tenant.tenantName}: day ${tenant.day} at ${tenant.time} (cron: ${cronExpression}, timezone: ${tenant.timezone})`);

  const task = cron.schedule(cronExpression, async () => {
    console.log(`[EXPENSE-REMINDERS] Cron triggered for tenant ${tenant.tenantName}`);
    await runExpenseRemindersForTenant(tenant.tenantId);
  }, {
    timezone: tenant.timezone
  });

  scheduledTasks.set(tenant.tenantId, task);
}

export async function runAllExpenseReminders(
  triggeredBy: 'scheduled' | 'manual' | 'catchup' = 'scheduled',
  triggeredByUserId?: string
): Promise<{ sent: number; skipped: number; errors: number }> {
  console.log('[EXPENSE-REMINDERS] Running expense reminders for all enabled tenants...');
  
  const tenants = await storage.getTenants();
  const enabledTenants = tenants.filter(t => t.expenseRemindersEnabled);
  
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  for (const tenant of enabledTenants) {
    try {
      const result = await runExpenseRemindersForTenant(tenant.id, triggeredBy, triggeredByUserId);
      totalSent += result.sent;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    } catch (err: any) {
      console.error(`[EXPENSE-REMINDERS] Failed for tenant ${tenant.name}:`, err.message);
      totalErrors++;
    }
  }
  
  console.log(`[EXPENSE-REMINDERS] All tenants complete: ${totalSent} sent, ${totalSkipped} skipped, ${totalErrors} errors`);
  return { sent: totalSent, skipped: totalSkipped, errors: totalErrors };
}

export async function startExpenseReminderScheduler(): Promise<void> {
  console.log('[EXPENSE-REMINDERS] Starting expense reminder scheduler...');
  
  const tenants = await storage.getTenants();
  
  for (const tenant of tenants) {
    if (tenant.expenseRemindersEnabled) {
      await scheduleForTenant({
        tenantId: tenant.id,
        tenantName: tenant.name,
        time: tenant.expenseReminderTime || '08:00',
        day: tenant.expenseReminderDay ?? 1,
        timezone: tenant.defaultTimezone || 'America/New_York'
      });
    }
  }

  console.log(`[EXPENSE-REMINDERS] Scheduler started with ${scheduledTasks.size} tenant(s) configured`);
}

export function stopExpenseReminderScheduler(): void {
  const entries = Array.from(scheduledTasks.entries());
  for (const [tenantId, task] of entries) {
    task.stop();
    console.log(`[EXPENSE-REMINDERS] Stopped scheduler for tenant ${tenantId}`);
  }
  scheduledTasks.clear();
  console.log('[EXPENSE-REMINDERS] All schedulers stopped');
}

export async function updateTenantExpenseSchedule(tenantId: string): Promise<void> {
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) {
    console.log(`[EXPENSE-REMINDERS] Tenant ${tenantId} not found for schedule update`);
    return;
  }

  const existingTask = scheduledTasks.get(tenantId);
  if (existingTask) {
    existingTask.stop();
    scheduledTasks.delete(tenantId);
  }

  if (tenant.expenseRemindersEnabled) {
    await scheduleForTenant({
      tenantId: tenant.id,
      tenantName: tenant.name,
      time: tenant.expenseReminderTime || '08:00',
      day: tenant.expenseReminderDay ?? 1,
      timezone: tenant.defaultTimezone || 'America/New_York'
    });
    console.log(`[EXPENSE-REMINDERS] Updated schedule for tenant ${tenant.name}`);
  } else {
    console.log(`[EXPENSE-REMINDERS] Disabled reminders for tenant ${tenant.name}`);
  }
}

export async function restartExpenseReminderScheduler(): Promise<void> {
  stopExpenseReminderScheduler();
  await startExpenseReminderScheduler();
}
