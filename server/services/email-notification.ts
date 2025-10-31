import { getUncachableOutlookClient } from './outlook-client.js';

interface EmailRecipient {
  email: string;
  name: string;
}

interface SendEmailOptions {
  to: EmailRecipient;
  subject: string;
  body: string;
}

export class EmailNotificationService {
  /**
   * Send an email using Microsoft Graph API via Outlook
   */
  async sendEmail({ to, subject, body }: SendEmailOptions): Promise<void> {
    try {
      const client = await getUncachableOutlookClient();
      
      const message = {
        subject,
        body: {
          contentType: 'HTML',
          content: body
        },
        toRecipients: [
          {
            emailAddress: {
              address: to.email,
              name: to.name
            }
          }
        ]
      };

      await client.api('/me/sendMail').post({ message });
      
      console.log(`[EMAIL] Sent email to ${to.email}: ${subject}`);
    } catch (error) {
      console.error('[EMAIL] Failed to send email:', error);
      // Don't throw - we don't want email failures to break the workflow
      // Log the error and continue
    }
  }

  /**
   * Notify submitter that their expense report was submitted successfully
   */
  async notifyExpenseReportSubmitted(submitter: EmailRecipient, reportNumber: string, reportTitle: string): Promise<void> {
    const subject = `Expense Report ${reportNumber} Submitted for Approval`;
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #7C3AED;">Expense Report Submitted</h2>
          <p>Hi ${submitter.name},</p>
          <p>Your expense report has been successfully submitted for approval:</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
            <strong>Report Number:</strong> ${reportNumber}<br>
            <strong>Title:</strong> ${reportTitle}
          </div>
          <p>You'll receive a notification once your report has been reviewed.</p>
          <p>Thank you,<br>Synozur Consulting Delivery Platform</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: submitter, subject, body });
  }

  /**
   * Notify approver that a new expense report needs approval
   */
  async notifyExpenseReportNeedsApproval(approver: EmailRecipient, submitter: EmailRecipient, reportNumber: string, reportTitle: string, totalAmount: string, currency: string): Promise<void> {
    const subject = `New Expense Report Awaiting Approval: ${reportNumber}`;
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #7C3AED;">Expense Report Awaiting Your Approval</h2>
          <p>Hi ${approver.name},</p>
          <p>A new expense report has been submitted and requires your approval:</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
            <strong>Report Number:</strong> ${reportNumber}<br>
            <strong>Title:</strong> ${reportTitle}<br>
            <strong>Submitted By:</strong> ${submitter.name} (${submitter.email})<br>
            <strong>Total Amount:</strong> ${currency} ${totalAmount}
          </div>
          <p>Please review this report at your earliest convenience.</p>
          <p>Thank you,<br>Synozur Consulting Delivery Platform</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: approver, subject, body });
  }

  /**
   * Notify submitter that their expense report was approved
   */
  async notifyExpenseReportApproved(submitter: EmailRecipient, approver: EmailRecipient, reportNumber: string, reportTitle: string, approverNote?: string): Promise<void> {
    const subject = `Expense Report ${reportNumber} Approved`;
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #22C55E;">Expense Report Approved</h2>
          <p>Hi ${submitter.name},</p>
          <p>Great news! Your expense report has been approved:</p>
          <div style="background-color: #f0fdf4; padding: 15px; border-left: 4px solid #22C55E; margin: 20px 0;">
            <strong>Report Number:</strong> ${reportNumber}<br>
            <strong>Title:</strong> ${reportTitle}<br>
            <strong>Approved By:</strong> ${approver.name}
            ${approverNote ? `<br><strong>Note:</strong> ${approverNote}` : ''}
          </div>
          <p>Your expenses will be processed for reimbursement shortly.</p>
          <p>Thank you,<br>Synozur Consulting Delivery Platform</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: submitter, subject, body });
  }

  /**
   * Notify submitter that their expense report was rejected
   */
  async notifyExpenseReportRejected(submitter: EmailRecipient, rejecter: EmailRecipient, reportNumber: string, reportTitle: string, rejectionNote?: string): Promise<void> {
    const subject = `Expense Report ${reportNumber} Requires Revision`;
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #EF4444;">Expense Report Requires Revision</h2>
          <p>Hi ${submitter.name},</p>
          <p>Your expense report has been reviewed and requires some changes:</p>
          <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #EF4444; margin: 20px 0;">
            <strong>Report Number:</strong> ${reportNumber}<br>
            <strong>Title:</strong> ${reportTitle}<br>
            <strong>Reviewed By:</strong> ${rejecter.name}
            ${rejectionNote ? `<br><br><strong>Reason:</strong><br>${rejectionNote}` : ''}
          </div>
          <p>Please review the feedback and resubmit your report with the necessary corrections.</p>
          <p>Thank you,<br>Synozur Consulting Delivery Platform</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: submitter, subject, body });
  }

  /**
   * Notify employee that their expenses have been included in a reimbursement batch
   */
  async notifyReimbursementBatchProcessed(employee: EmailRecipient, batchNumber: string, totalAmount: string, currency: string, expenseCount: number): Promise<void> {
    const subject = `Reimbursement Batch ${batchNumber} Processed`;
    const body = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #7C3AED;">Reimbursement Batch Processed</h2>
          <p>Hi ${employee.name},</p>
          <p>Your approved expenses have been included in a reimbursement batch and are being processed for payment:</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #7C3AED; margin: 20px 0;">
            <strong>Batch Number:</strong> ${batchNumber}<br>
            <strong>Total Amount:</strong> ${currency} ${totalAmount}<br>
            <strong>Number of Expenses:</strong> ${expenseCount}
          </div>
          <p>You can expect payment according to your organization's reimbursement schedule.</p>
          <p>Thank you,<br>Synozur Consulting Delivery Platform</p>
        </body>
      </html>
    `;

    await this.sendEmail({ to: employee, subject, body });
  }
}

export const emailService = new EmailNotificationService();
