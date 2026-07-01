import { db } from "../db.js";
import { notifications, userNotificationPreferences, tenantUsers } from "@shared/schema.js";
import { and, eq } from "drizzle-orm";
import type { NotificationType } from "@shared/schema.js";

export interface NotifyParams {
  userId: string;
  tenantId: string;
  type: NotificationType | string;
  title: string;
  body?: string;
  entityRef?: string;
  link?: string;
  /**
   * Optional rich email function. Called only when the user's email preference
   * is enabled for this notification type. Omit to get the built-in generic
   * email template instead.
   */
  emailFn?: () => Promise<void>;
  /**
   * Optional Teams message function. Called only when the user's teams
   * preference is enabled for this notification type.
   */
  teamsFn?: () => Promise<void>;
}

const DEFAULT_PREFS: Record<string, { inApp: boolean; email: boolean; teams: boolean }> = {
  expense_submitted:        { inApp: true, email: true,  teams: false },
  expense_approval_needed:  { inApp: true, email: true,  teams: false },
  expense_approved:         { inApp: true, email: true,  teams: false },
  expense_rejected:         { inApp: true, email: true,  teams: false },
  project_health_alert:     { inApp: true, email: false, teams: true  },
  raidd_overdue:            { inApp: true, email: false, teams: true  },
  status_report_due:        { inApp: true, email: false, teams: true  },
  ai_budget_alert:          { inApp: true, email: true,  teams: false },
  project_budget_alert:     { inApp: true, email: true,  teams: false },
  time_reminder:            { inApp: true, email: true,  teams: false },
  expense_reminder:         { inApp: true, email: true,  teams: false },
  timesheet_submitted:      { inApp: true, email: true,  teams: false },
  timesheet_approved:       { inApp: true, email: true,  teams: false },
  timesheet_rejected:       { inApp: true, email: true,  teams: false },
  invoice_sent:             { inApp: true, email: false, teams: false },
  invoice_paid:             { inApp: true, email: false, teams: false },
  raidd_assigned:           { inApp: true, email: true,  teams: false },
  general:                  { inApp: true, email: false, teams: false },
};

export async function getUserChannelPrefs(
  userId: string,
  tenantId: string,
  notificationType: string
): Promise<{ inApp: boolean; email: boolean; teams: boolean }> {
  const [row] = await db
    .select()
    .from(userNotificationPreferences)
    .where(
      and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.tenantId, tenantId),
        eq(userNotificationPreferences.notificationType, notificationType)
      )
    )
    .limit(1);

  if (row) {
    return { inApp: row.inApp, email: row.email, teams: row.teams };
  }

  // Client-role users typically have no login and cannot manage their own
  // preferences, so default ALL channels off unless an explicit pref row exists.
  const [membership] = await db
    .select({ role: tenantUsers.role })
    .from(tenantUsers)
    .where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.tenantId, tenantId)))
    .limit(1);

  if (membership?.role === 'client') {
    return { inApp: false, email: false, teams: false };
  }

  return DEFAULT_PREFS[notificationType] ?? { inApp: true, email: false, teams: false };
}

export async function notify(params: NotifyParams): Promise<void> {
  try {
    const prefs = await getUserChannelPrefs(params.userId, params.tenantId, params.type);

    if (prefs.inApp) {
      await db.insert(notifications).values({
        userId: params.userId,
        tenantId: params.tenantId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        entityRef: params.entityRef ?? null,
        link: params.link ?? null,
        readAt: null,
      });
    }

    if (prefs.email) {
      try {
        if (params.emailFn) {
          await params.emailFn();
        } else {
          const { storage } = await import("../storage.js");
          const { emailService } = await import("./email-notification.js");
          const user = await storage.getUser(params.userId);
          if (user?.email && user?.name) {
            const tenant = await storage.getTenant(params.tenantId);
            const headerImg = tenant?.emailHeaderUrl
              ? `<img src="${tenant.emailHeaderUrl}" alt="${tenant.name ?? ''}" style="max-width:200px;margin-bottom:16px"><br>`
              : '';
            const linkLine = params.link
              ? `<p><a href="${params.link}" style="color:#6d28d9">Open in Constellation</a></p>`
              : '';
            const body = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
              ${headerImg}
              <h2 style="color:#6d28d9;margin-top:0">${params.title}</h2>
              ${params.body ? `<p style="margin:0 0 16px">${params.body}</p>` : ''}
              ${linkLine}
              <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
              <p style="font-size:12px;color:#9ca3af">To change notification preferences, visit <a href="/notifications/preferences">Notification Preferences</a>.</p>
            </body></html>`;
            await emailService.sendEmail({
              to: { email: user.email, name: user.name },
              subject: params.title,
              body,
            });
          }
        }
      } catch (emailErr) {
        console.error('[NOTIFY] Email send failed (non-blocking):', emailErr);
      }
    }

    if (prefs.teams && params.teamsFn) {
      try {
        await params.teamsFn();
      } catch (teamsErr) {
        console.error('[NOTIFY] Teams send failed (non-blocking):', teamsErr);
      }
    }

    // Web Push fan-out — fires alongside in-app delivery. Browser push is its
    // own delivery channel: opting in is signalled by the presence of an
    // active push subscription (managed via the toggle on
    // /notifications/preferences), independent of the in-app/email/teams
    // checkboxes. sendPushToUser short-circuits when the user has no
    // subscriptions, so this is a cheap call when push is unused.
    try {
      const { sendPushToUser, ensurePushConfigured } = await import('./push-notification-service.js');
      if (await ensurePushConfigured()) {
        await sendPushToUser(params.userId, params.tenantId, {
          title: params.title,
          body: params.body,
          link: params.link,
          type: typeof params.type === 'string' ? params.type : undefined,
          entityRef: params.entityRef,
        });
      }
    } catch (pushErr) {
      console.error('[NOTIFY] Push send failed (non-blocking):', pushErr);
    }
  } catch (err) {
    console.error('[NOTIFY] Failed to process notification (non-blocking):', err);
  }
}

export async function notifyMany(params: NotifyParams[]): Promise<void> {
  await Promise.all(params.map(notify));
}

export const notificationService = { notify, notifyMany, getUserChannelPrefs };
