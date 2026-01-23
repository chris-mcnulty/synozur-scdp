import * as cron from 'node-cron';
import { storage } from '../storage.js';
import { EmailNotificationService } from './email-notification.js';

const emailService = new EmailNotificationService();

interface ReminderRecipient {
  userId: string;
  email: string;
  name: string;
  projectNames: string[];
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

/**
 * Format a date as YYYY-MM-DD in local timezone (not UTC)
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate the start of the prior work week (Monday)
 */
function getPriorWeekStart(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysToSubtract);
  const priorMonday = new Date(thisMonday);
  priorMonday.setDate(thisMonday.getDate() - 7);
  priorMonday.setHours(0, 0, 0, 0);
  return priorMonday;
}

/**
 * Get users who need time entry reminders
 * Criteria:
 * - User has ACTIVE engagement on active projects (not 'complete')
 * - User has receiveTimeReminders enabled
 * - User has email address
 * - User is active
 * - User has NOT entered time for the prior week
 */
async function getUsersNeedingReminders(): Promise<ReminderRecipient[]> {
  const recipients: Map<string, ReminderRecipient> = new Map();
  
  const priorWeekStart = getPriorWeekStart();
  const priorWeekEnd = new Date(priorWeekStart);
  priorWeekEnd.setDate(priorWeekStart.getDate() + 6);
  
  const users = await storage.getUsers();
  const activeUsers = users.filter(u => 
    u.isActive && 
    u.email && 
    u.receiveTimeReminders !== false &&
    u.canLogin
  );

  for (const user of activeUsers) {
    // Use getUserActiveEngagements which returns only engagements with status='active' on active projects
    const activeEngagements = await storage.getUserActiveEngagements(user.id);
    
    if (activeEngagements.length === 0) continue;
    
    const activeProjectNames = activeEngagements.map(e => e.project.name);

    // Check if the user has logged any time for the prior week (using local timezone dates)
    const timeEntries = await storage.getTimeEntries({
      personId: user.id,
      startDate: formatLocalDate(priorWeekStart),
      endDate: formatLocalDate(priorWeekEnd)
    });

    // Only remind users who have no time entries at all for the prior week
    if (timeEntries.length === 0) {
      recipients.set(user.id, {
        userId: user.id,
        email: user.email!,
        name: user.name,
        projectNames: activeProjectNames
      });
    }
  }

  return Array.from(recipients.values());
}

/**
 * Send a time entry reminder email to a user
 */
async function sendReminderEmail(recipient: ReminderRecipient, appUrl: string): Promise<void> {
  const priorWeekStart = getPriorWeekStart();
  const weekEndDate = new Date(priorWeekStart);
  weekEndDate.setDate(priorWeekStart.getDate() + 6);
  
  const weekStartStr = priorWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekEndStr = weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  const projectList = recipient.projectNames.map(name => `<li>${escapeHtml(name)}</li>`).join('');
  
  const subject = `Time Entry Reminder: Week of ${weekStartStr}`;
  const body = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #7C3AED;">Time Entry Reminder</h2>
        <p>Hi ${escapeHtml(recipient.name)},</p>
        <p>This is a friendly reminder to enter your time for the week of <strong>${weekStartStr} - ${weekEndStr}</strong>.</p>
        <p>You have active assignments on the following project(s):</p>
        <ul style="background-color: #f4f4f4; padding: 15px 15px 15px 35px; border-left: 4px solid #7C3AED; margin: 20px 0;">
          ${projectList}
        </ul>
        <p>
          <a href="${appUrl}/time" style="display: inline-block; background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0;">
            Enter Time Now
          </a>
        </p>
        <p style="color: #666; font-size: 0.9em; margin-top: 30px;">
          You can disable these reminders in your personal settings if you prefer not to receive them.
        </p>
        <p>Thank you,<br>Synozur Consulting Delivery Platform</p>
      </body>
    </html>
  `;

  await emailService.sendEmail({
    to: { email: recipient.email, name: recipient.name },
    subject,
    body
  });
}

/**
 * Run the time reminder job
 * This is called by the scheduler or can be triggered manually
 */
export async function runTimeReminders(): Promise<{ sent: number; skipped: number; errors: number }> {
  console.log('[TIME-REMINDERS] Starting time reminder job...');
  
  const remindersEnabled = await storage.getSystemSettingValue('TIME_REMINDERS_ENABLED', 'true');
  if (remindersEnabled !== 'true') {
    console.log('[TIME-REMINDERS] Time reminders are disabled at system level. Skipping.');
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const appUrl = process.env.APP_URL 
    || (process.env.REPLIT_DEPLOYMENT === '1' ? 'https://scdp.synozur.com' : null)
    || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : null)
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    || 'https://scdp.synozur.com';

  const recipients = await getUsersNeedingReminders();
  console.log(`[TIME-REMINDERS] Found ${recipients.length} users to remind`);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const recipient of recipients) {
    try {
      await sendReminderEmail(recipient, appUrl);
      sent++;
      console.log(`[TIME-REMINDERS] Sent reminder to ${recipient.email}`);
    } catch (error) {
      errors++;
      console.error(`[TIME-REMINDERS] Failed to send reminder to ${recipient.email}:`, error);
    }
  }

  console.log(`[TIME-REMINDERS] Completed: ${sent} sent, ${skipped} skipped, ${errors} errors`);
  return { sent, skipped, errors };
}

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Start the time reminder scheduler
 * Runs every Thursday at the configured time
 */
export async function startTimeReminderScheduler(): Promise<void> {
  if (scheduledTask) {
    console.log('[TIME-REMINDERS] Scheduler already running');
    return;
  }

  const reminderTime = await storage.getSystemSettingValue('TIME_REMINDER_TIME', '23:30');
  const reminderDay = await storage.getSystemSettingValue('TIME_REMINDER_DAY', '4');
  
  const [hours, minutes] = reminderTime.split(':').map(Number);
  const dayOfWeek = parseInt(reminderDay, 10);

  const cronExpression = `${minutes} ${hours} * * ${dayOfWeek}`;
  
  console.log(`[TIME-REMINDERS] Scheduling reminders for day ${dayOfWeek} at ${reminderTime} (cron: ${cronExpression})`);

  scheduledTask = cron.schedule(cronExpression, async () => {
    console.log('[TIME-REMINDERS] Cron triggered, running reminders...');
    await runTimeReminders();
  }, {
    timezone: 'America/New_York'
  });

  console.log('[TIME-REMINDERS] Scheduler started');
}

/**
 * Stop the time reminder scheduler
 */
export function stopTimeReminderScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[TIME-REMINDERS] Scheduler stopped');
  }
}

/**
 * Restart the scheduler (e.g., after settings change)
 */
export async function restartTimeReminderScheduler(): Promise<void> {
  stopTimeReminderScheduler();
  await startTimeReminderScheduler();
}
