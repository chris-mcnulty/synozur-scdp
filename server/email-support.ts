import { getUncachableSendGridClient } from "./services/sendgrid-client";
import type { SupportTicket } from "@shared/schema";

const APP_URL = process.env.APP_PUBLIC_URL || 'https://scdp.synozur.com';

const SUPPORT_NOTIFICATION_EMAIL = "Constellation@synozur.com";

export async function sendSupportTicketNotification(
  ticket: SupportTicket,
  user: { email: string; firstName?: string | null; lastName?: string | null }
) {
  const { client, fromEmail } = await getUncachableSendGridClient();
  const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

  const msg = {
    to: SUPPORT_NOTIFICATION_EMAIL,
    from: fromEmail,
    subject: `[Constellation Support] New ${ticket.priority} ${ticket.category.replace('_', ' ')} - Ticket #${ticket.ticketNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #ffffff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0a;">
            <tr>
              <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #1a1a1a; border-radius: 12px; overflow: hidden;">
                  <tr>
                    <td style="padding: 30px 40px; background: ${ticket.priority === 'high' ? '#dc2626' : ticket.priority === 'medium' ? '#d97706' : '#2563eb'};">
                      <h1 style="margin: 0; font-size: 20px; color: #ffffff;">New Support Ticket #${ticket.ticketNumber}</h1>
                      <p style="margin: 5px 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">${(ticket.priority || 'medium').toUpperCase()} priority ${ticket.category.replace('_', ' ')}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px 40px;">
                      <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">
                        <tr><td style="padding: 8px 12px; font-size: 13px; color: #888; border-bottom: 1px solid #333;">Application</td><td style="padding: 8px 12px; font-size: 13px; color: #e0e0e0; border-bottom: 1px solid #333;">Constellation</td></tr>
                        <tr><td style="padding: 8px 12px; font-size: 13px; color: #888; border-bottom: 1px solid #333;">User</td><td style="padding: 8px 12px; font-size: 13px; color: #e0e0e0; border-bottom: 1px solid #333;">${userName} (${user.email})</td></tr>
                        <tr><td style="padding: 8px 12px; font-size: 13px; color: #888;">Subject</td><td style="padding: 8px 12px; font-size: 13px; color: #e0e0e0;">${ticket.subject}</td></tr>
                      </table>
                      <div style="padding: 16px; background: #111; border-radius: 8px; margin: 0 0 20px;">
                        <p style="margin: 0; font-size: 13px; color: #ccc; white-space: pre-wrap;">${ticket.description}</p>
                      </div>
                      <a href="${APP_URL}/support" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px;">View in Constellation</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  await client.send(msg);
}

export async function sendTicketConfirmationToSubmitter(
  ticket: SupportTicket,
  user: { email: string; firstName?: string | null; lastName?: string | null }
) {
  const { client, fromEmail } = await getUncachableSendGridClient();
  const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'there';

  const msg = {
    to: user.email,
    from: fromEmail,
    subject: `Your support ticket #${ticket.ticketNumber} has been received`,
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; color: #333;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
            <tr>
              <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 30px 40px; background: #2563eb;">
                      <h1 style="margin: 0; font-size: 20px; color: #ffffff;">Support Ticket Received</h1>
                      <p style="margin: 5px 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">Ticket #${ticket.ticketNumber}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px 40px;">
                      <p style="margin: 0 0 16px; font-size: 14px; color: #333;">Hi ${userName},</p>
                      <p style="margin: 0 0 16px; font-size: 14px; color: #333;">Thank you for reaching out. We've received your support ticket and our team will review it shortly.</p>
                      <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; background: #f9fafb; border-radius: 8px;">
                        <tr><td style="padding: 10px 14px; font-size: 13px; color: #666; border-bottom: 1px solid #e5e7eb;">Ticket #</td><td style="padding: 10px 14px; font-size: 13px; color: #333; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${ticket.ticketNumber}</td></tr>
                        <tr><td style="padding: 10px 14px; font-size: 13px; color: #666; border-bottom: 1px solid #e5e7eb;">Subject</td><td style="padding: 10px 14px; font-size: 13px; color: #333; border-bottom: 1px solid #e5e7eb;">${ticket.subject}</td></tr>
                        <tr><td style="padding: 10px 14px; font-size: 13px; color: #666; border-bottom: 1px solid #e5e7eb;">Category</td><td style="padding: 10px 14px; font-size: 13px; color: #333; border-bottom: 1px solid #e5e7eb;">${ticket.category.replace('_', ' ')}</td></tr>
                        <tr><td style="padding: 10px 14px; font-size: 13px; color: #666;">Priority</td><td style="padding: 10px 14px; font-size: 13px; color: #333;">${(ticket.priority || 'medium').charAt(0).toUpperCase() + (ticket.priority || 'medium').slice(1)}</td></tr>
                      </table>
                      <p style="margin: 0 0 20px; font-size: 14px; color: #333;">You can track your ticket status and add updates anytime:</p>
                      <a href="${APP_URL}/support" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px;">View Your Ticket</a>
                      <p style="margin: 20px 0 0; font-size: 13px; color: #888;">You'll receive another email when your ticket is resolved.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  await client.send(msg);
}
