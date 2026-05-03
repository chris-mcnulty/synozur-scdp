// Email notifications via SendGrid
// Reference: connection:conn_sendgrid_01K7J5YQ6FY2TCBHA5B8JBJEXT
import { getUncachableSendGridClient } from './sendgrid-client.js';

interface EmailRecipient {
  email: string;
  name: string;
}

interface TenantBranding {
  emailHeaderUrl?: string | null;
  companyName?: string | null;
}

/**
 * Escape HTML to prevent injection in email templates
 */
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
 * Generate email header HTML with optional branding image
 */
function getEmailHeader(branding?: TenantBranding): string {
  if (branding?.emailHeaderUrl) {
    return `
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${escapeHtml(branding.emailHeaderUrl)}" alt="${escapeHtml(branding.companyName || 'Company')}" style="max-width: 100%; height: auto; max-height: 120px;" />
      </div>
    `;
  }
  return '';
}

interface EmailAttachment {
  content: string; // base64-encoded
  filename: string;
  type: string;
  disposition?: string;
}

interface SendEmailOptions {
  to: EmailRecipient;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
}

export class EmailNotificationService {
  /**
   * Send an email using SendGrid API
   * From address is configured in the SendGrid connection (donotreply@synozur.com)
   */
  async sendEmail({ to, subject, body, attachments }: SendEmailOptions): Promise<void> {
    try {
      const { client, fromEmail } = await getUncachableSendGridClient();

      const msg: Record<string, unknown> = {
        to: to.email,
        from: {
          email: fromEmail,
          name: 'Constellation (SCDP)'
        },
        subject,
        html: body
      };
      if (attachments && attachments.length > 0) {
        msg.attachments = attachments.map(a => ({
          content: a.content,
          filename: a.filename,
          type: a.type,
          disposition: a.disposition ?? 'attachment',
        }));
      }

      await client.send(msg as unknown as Parameters<typeof client.send>[0]);
      
      console.log(`[EMAIL] Sent email via SendGrid to ${to.email}: ${subject}`);
    } catch (error) {
      console.error('[EMAIL] Failed to send email via SendGrid:', error);
      // Don't throw - we don't want email failures to break the workflow
      // Log the error and continue
    }
  }

  /**
   * Notify submitter that their expense report was submitted successfully
   */
  async notifyExpenseReportSubmitted(submitter: EmailRecipient, reportNumber: string, reportTitle: string, branding?: TenantBranding, reportUrl?: string): Promise<void> {
    const subject = `Expense Report ${reportNumber} Submitted for Approval`;
    const header = getEmailHeader(branding);
    const viewReportButton = reportUrl ? `
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(reportUrl)}" style="background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Report</a>
      </p>
    ` : '';
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #7C3AED;">Expense Report Submitted</h2>
          <p>Hi ${escapeHtml(submitter.name)},</p>
          <p>Your expense report has been successfully submitted for approval:</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
            <strong>Report Number:</strong> ${escapeHtml(reportNumber)}<br>
            <strong>Title:</strong> ${escapeHtml(reportTitle)}
          </div>
          ${viewReportButton}
          <p>You'll receive a notification once your report has been reviewed.</p>
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: submitter, subject, body });
  }

  /**
   * Notify approver that a new expense report needs approval
   */
  async notifyExpenseReportNeedsApproval(approver: EmailRecipient, submitter: EmailRecipient, reportNumber: string, reportTitle: string, totalAmount: string, currency: string, branding?: TenantBranding, reportUrl?: string): Promise<void> {
    const subject = `New Expense Report Awaiting Approval: ${reportNumber}`;
    const header = getEmailHeader(branding);
    const viewReportButton = reportUrl ? `
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(reportUrl)}" style="background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review Report</a>
      </p>
    ` : '';
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #7C3AED;">Expense Report Awaiting Your Approval</h2>
          <p>Hi ${escapeHtml(approver.name)},</p>
          <p>A new expense report has been submitted and requires your approval:</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
            <strong>Report Number:</strong> ${escapeHtml(reportNumber)}<br>
            <strong>Title:</strong> ${escapeHtml(reportTitle)}<br>
            <strong>Submitted By:</strong> ${escapeHtml(submitter.name)} (${escapeHtml(submitter.email)})<br>
            <strong>Total Amount:</strong> ${escapeHtml(currency)} ${escapeHtml(totalAmount)}
          </div>
          ${viewReportButton}
          <p>Please review this report at your earliest convenience.</p>
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: approver, subject, body });
  }

  /**
   * Notify submitter that their expense report was approved
   */
  async notifyExpenseReportApproved(submitter: EmailRecipient, approver: EmailRecipient, reportNumber: string, reportTitle: string, approverNote?: string, branding?: TenantBranding, reportUrl?: string): Promise<void> {
    const subject = `Expense Report ${reportNumber} Approved`;
    const escapedNote = approverNote ? escapeHtml(approverNote) : '';
    const header = getEmailHeader(branding);
    const viewReportButton = reportUrl ? `
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(reportUrl)}" style="background-color: #22C55E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Report</a>
      </p>
    ` : '';
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #22C55E;">Expense Report Approved</h2>
          <p>Hi ${escapeHtml(submitter.name)},</p>
          <p>Great news! Your expense report has been approved:</p>
          <div style="background-color: #f0fdf4; padding: 15px; border-left: 4px solid #22C55E; margin: 20px 0;">
            <strong>Report Number:</strong> ${escapeHtml(reportNumber)}<br>
            <strong>Title:</strong> ${escapeHtml(reportTitle)}<br>
            <strong>Approved By:</strong> ${escapeHtml(approver.name)}
            ${escapedNote ? `<br><strong>Note:</strong> ${escapedNote}` : ''}
          </div>
          ${viewReportButton}
          <p>Your expenses will be processed for reimbursement shortly.</p>
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: submitter, subject, body });
  }

  /**
   * Notify submitter that their expense report was rejected
   */
  async notifyExpenseReportRejected(submitter: EmailRecipient, rejecter: EmailRecipient, reportNumber: string, reportTitle: string, rejectionNote?: string, branding?: TenantBranding, reportUrl?: string): Promise<void> {
    const subject = `Expense Report ${reportNumber} Requires Revision`;
    const escapedNote = rejectionNote ? escapeHtml(rejectionNote) : '';
    const header = getEmailHeader(branding);
    const viewReportButton = reportUrl ? `
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(reportUrl)}" style="background-color: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Edit Report</a>
      </p>
    ` : '';
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #EF4444;">Expense Report Requires Revision</h2>
          <p>Hi ${escapeHtml(submitter.name)},</p>
          <p>Your expense report has been reviewed and requires some changes:</p>
          <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #EF4444; margin: 20px 0;">
            <strong>Report Number:</strong> ${escapeHtml(reportNumber)}<br>
            <strong>Title:</strong> ${escapeHtml(reportTitle)}<br>
            <strong>Reviewed By:</strong> ${escapeHtml(rejecter.name)}
            ${escapedNote ? `<br><br><strong>Reason:</strong><br>${escapedNote.replace(/\n/g, '<br>')}` : ''}
          </div>
          ${viewReportButton}
          <p>Please review the feedback and resubmit your report with the necessary corrections.</p>
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: submitter, subject, body });
  }

  /**
   * Send a test email to verify branding and email configuration
   */
  async sendTestEmail(recipient: EmailRecipient, branding?: TenantBranding): Promise<void> {
    console.log("[EMAIL_SERVICE] sendTestEmail called with branding:", JSON.stringify(branding, null, 2));
    const subject = `Test Email from ${branding?.companyName || 'Constellation'}`;
    const header = getEmailHeader(branding);
    console.log("[EMAIL_SERVICE] Generated header HTML:", header ? header.substring(0, 200) + '...' : '(empty)');
    const testButton = `
      <p style="margin: 20px 0;">
        <a href="#" style="background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Sample Button</a>
      </p>
    `;
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #7C3AED;">Test Email</h2>
          <p>Hi ${escapeHtml(recipient.name)},</p>
          <p>This is a test email to verify your email branding configuration.</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
            <strong>Company Name:</strong> ${escapeHtml(branding?.companyName || 'Not configured')}<br>
            <strong>Email Header:</strong> ${branding?.emailHeaderUrl ? 'Configured' : 'Not configured'}
          </div>
          ${testButton}
          <p>If you see your branded header at the top of this email, your configuration is working correctly!</p>
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: recipient, subject, body });
  }

  /**
   * Notify requester that their support ticket has been resolved/closed
   */
  async notifySupportTicketClosed(
    requester: EmailRecipient,
    ticketNumber: number,
    subject: string,
    resolutionNote?: string,
    branding?: TenantBranding,
    ticketUrl?: string
  ): Promise<void> {
    const emailSubject = `Support Ticket #${ticketNumber} Resolved: ${subject}`;
    const header = getEmailHeader(branding);
    const viewTicketButton = ticketUrl ? `
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(ticketUrl)}" style="background-color: #22C55E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Ticket</a>
      </p>
    ` : '';
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #22C55E;">Support Ticket Resolved</h2>
          <p>Hi ${escapeHtml(requester.name)},</p>
          <p>Your support ticket has been resolved:</p>
          <div style="background-color: #f0fdf4; padding: 15px; border-left: 4px solid #22C55E; margin: 20px 0;">
            <strong>Ticket #:</strong> ${ticketNumber}<br>
            <strong>Subject:</strong> ${escapeHtml(subject)}
            ${resolutionNote ? `<br><br><strong>Resolution:</strong><br>${escapeHtml(resolutionNote).replace(/\n/g, '<br>')}` : ''}
          </div>
          ${viewTicketButton}
          <p>If you have any further questions or this issue persists, feel free to open a new ticket or reply.</p>
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: requester, subject: emailSubject, body });
  }

  /**
   * Notify employee that their expenses have been included in a reimbursement batch
   */
  async notifyReimbursementBatchProcessed(
    employee: EmailRecipient,
    batchNumber: string,
    totalAmount: string,
    currency: string,
    expenseCount: number,
    branding?: TenantBranding,
    paymentReferenceNumber?: string,
    expenseDetails?: Array<{ date: string; category: string; description: string; amount: string; currency: string }>
  ): Promise<void> {
    const subject = `Reimbursement ${batchNumber} Processed`;
    const header = getEmailHeader(branding);

    let expenseTableHtml = '';
    if (expenseDetails && expenseDetails.length > 0) {
      const rows = expenseDetails.map(exp => {
        const dateStr = new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(dateStr)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-transform: capitalize;">${escapeHtml(exp.category)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(exp.description)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${escapeHtml(exp.currency)} ${escapeHtml(parseFloat(exp.amount).toFixed(2))}</td>
          </tr>
        `;
      }).join('');

      expenseTableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Date</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Category</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Description</th>
              <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="font-weight: bold; background-color: #f9fafb;">
              <td colspan="3" style="padding: 10px 12px; text-align: right; border-top: 2px solid #e5e7eb;">Total:</td>
              <td style="padding: 10px 12px; text-align: right; border-top: 2px solid #e5e7eb;">${escapeHtml(currency)} ${escapeHtml(parseFloat(totalAmount).toFixed(2))}</td>
            </tr>
          </tbody>
        </table>
      `;
    }

    const referenceHtml = paymentReferenceNumber
      ? `<strong>Payment Reference:</strong> ${escapeHtml(paymentReferenceNumber)}<br>`
      : '';

    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #7C3AED;">Reimbursement Processed</h2>
          <p>Hi ${escapeHtml(employee.name)},</p>
          <p>Your approved expenses have been processed for reimbursement:</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
            <strong>Batch Number:</strong> ${escapeHtml(batchNumber)}<br>
            ${referenceHtml}
            <strong>Total Amount:</strong> ${escapeHtml(currency)} ${escapeHtml(parseFloat(totalAmount).toFixed(2))}<br>
            <strong>Number of Expenses:</strong> ${expenseCount}
          </div>
          ${expenseTableHtml}
          <p>You can expect payment according to your organization's reimbursement schedule.</p>
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: employee, subject, body });
  }

  /**
   * Notify approvers that time entries have been submitted for approval
   */
  async notifyTimeEntriesSubmitted(
    submitter: EmailRecipient,
    approvers: EmailRecipient[],
    entryCount: number,
    weekLabel: string,
    projectNames: string[],
    branding?: TenantBranding,
    inboxUrl?: string
  ): Promise<void> {
    if (approvers.length === 0) return;
    const subject = `Time Entries Submitted for Approval — ${submitter.name}`;
    const header = getEmailHeader(branding);
    const reviewButton = inboxUrl ? `
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(inboxUrl)}" style="background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review Submissions</a>
      </p>
    ` : '';
    const projectList = projectNames.length > 0
      ? `<strong>Projects:</strong> ${escapeHtml(projectNames.join(', '))}<br>`
      : '';
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #7C3AED;">Time Entries Awaiting Your Approval</h2>
          <p>Hi,</p>
          <p><strong>${escapeHtml(submitter.name)}</strong> has submitted time entries for your approval:</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
            <strong>Week:</strong> ${escapeHtml(weekLabel)}<br>
            <strong>Entries:</strong> ${entryCount}<br>
            ${projectList}
          </div>
          ${reviewButton}
          <p>Please review and approve or reject these entries at your earliest convenience.</p>
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;

    for (const approver of approvers) {
      await this.sendEmail({ to: approver, subject, body });
    }
  }

  /**
   * Notify submitter that their time entries were approved
   */
  async notifyTimeEntriesApproved(
    submitter: EmailRecipient,
    approver: EmailRecipient,
    entryCount: number,
    weekLabel: string,
    branding?: TenantBranding,
    timeUrl?: string
  ): Promise<void> {
    const subject = `Your Time Entries Have Been Approved`;
    const header = getEmailHeader(branding);
    const viewButton = timeUrl ? `
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(timeUrl)}" style="background-color: #22C55E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Time Entries</a>
      </p>
    ` : '';
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #22C55E;">Time Entries Approved</h2>
          <p>Hi ${escapeHtml(submitter.name)},</p>
          <p>Your time entries have been approved:</p>
          <div style="background-color: #f0fdf4; padding: 15px; border-left: 4px solid #22C55E; margin: 20px 0;">
            <strong>Week:</strong> ${escapeHtml(weekLabel)}<br>
            <strong>Entries:</strong> ${entryCount}<br>
            <strong>Approved By:</strong> ${escapeHtml(approver.name)}
          </div>
          ${viewButton}
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;
    await this.sendEmail({ to: submitter, subject, body });
  }

  /**
   * Notify submitter that their time entries were rejected
   */
  async notifyTimeEntriesRejected(
    submitter: EmailRecipient,
    rejecter: EmailRecipient,
    entryCount: number,
    weekLabel: string,
    rejectionNote: string,
    branding?: TenantBranding,
    timeUrl?: string
  ): Promise<void> {
    const subject = `Your Time Entries Require Revision`;
    const header = getEmailHeader(branding);
    const viewButton = timeUrl ? `
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(timeUrl)}" style="background-color: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Edit Time Entries</a>
      </p>
    ` : '';
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #EF4444;">Time Entries Require Revision</h2>
          <p>Hi ${escapeHtml(submitter.name)},</p>
          <p>Your time entries have been reviewed and require changes:</p>
          <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #EF4444; margin: 20px 0;">
            <strong>Week:</strong> ${escapeHtml(weekLabel)}<br>
            <strong>Entries:</strong> ${entryCount}<br>
            <strong>Reviewed By:</strong> ${escapeHtml(rejecter.name)}
            ${rejectionNote ? `<br><br><strong>Reason:</strong><br>${escapeHtml(rejectionNote).replace(/\n/g, '<br>')}` : ''}
          </div>
          ${viewButton}
          <p>Please update your entries and resubmit.</p>
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;
    await this.sendEmail({ to: submitter, subject, body });
  }

  /**
   * Confirmation email when an estimate has been marked as sent to a client.
   * Includes the version number from the auto-snapshot so the recipient has
   * a stable reference ID to cite in replies.
   */
  async notifyEstimateSent(
    recipient: EmailRecipient,
    estimateName: string,
    versionNumber: number,
    sentDate: string,
    clientName?: string,
    branding?: TenantBranding,
    estimateUrl?: string,
    pdfAttachment?: { content: Buffer; filename: string }
  ): Promise<void> {
    const versionLabel = `Estimate v${versionNumber} — sent ${sentDate}`;
    const subject = `${estimateName} (${versionLabel})`;
    const header = getEmailHeader(branding);
    const viewButton = estimateUrl ? `
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(estimateUrl)}" style="background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Estimate</a>
      </p>
    ` : '';
    const clientLine = clientName
      ? `<strong>Client:</strong> ${escapeHtml(clientName)}<br>`
      : '';
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${header}
          <h2 style="color: #7C3AED;">Estimate Sent</h2>
          <p>Hi ${escapeHtml(recipient.name)},</p>
          <p>An estimate has been marked as sent. A version snapshot has been recorded for the audit trail.</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
            <strong>Estimate:</strong> ${escapeHtml(estimateName)}<br>
            ${clientLine}
            <strong>Version:</strong> v${versionNumber}<br>
            <strong>Sent:</strong> ${escapeHtml(sentDate)}
          </div>
          <p>Please reference <strong>${escapeHtml(versionLabel)}</strong> when discussing this estimate with the client.</p>
          ${viewButton}
          <p>Thank you,<br>${escapeHtml(branding?.companyName || 'Synozur Consulting Delivery Platform')}</p>
        </body>
      </html>
    `;
    const attachments: EmailAttachment[] | undefined = pdfAttachment
      ? [{
          content: pdfAttachment.content.toString('base64'),
          filename: pdfAttachment.filename,
          type: 'application/pdf',
          disposition: 'attachment',
        }]
      : undefined;
    await this.sendEmail({ to: recipient, subject, body, attachments });
  }
}

// Export the TenantBranding type for use in routes
export type { TenantBranding };

export const emailService = new EmailNotificationService();
