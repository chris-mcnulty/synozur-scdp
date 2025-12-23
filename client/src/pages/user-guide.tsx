import { Layout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function UserGuide() {
  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Guide</h1>
            <p className="text-xl text-muted-foreground">
              SCDP - Synozur Consulting Delivery Platform
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="prose prose-sm max-w-none dark:prose-invert space-y-6">
              <section>
                <h2 className="text-2xl font-bold mb-4">Welcome to SCDP by Synozur</h2>
                <p className="text-muted-foreground">
                  The Synozur Consulting Delivery Platform (SCDP) is a comprehensive solution designed to streamline the entire lifecycle of consulting projects. From initial estimation through final billing, SCDP helps you manage clients, track time, record expenses, and generate invoices efficiently.
                </p>
              </section>

              <Separator />

              <section>
                <h2 className="text-2xl font-bold mb-4">Getting Started</h2>
                
                <h3 className="text-xl font-semibold mt-4 mb-2">Logging In</h3>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Navigate to the SCDP login page</li>
                  <li>Enter your email address and password</li>
                  <li>Click "Log In"</li>
                </ol>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Note:</strong> Your account is created by system administrators. Contact IT Support at ITHelp@synozur.com if you need assistance with your login credentials.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">Your Dashboard</h3>
                <p className="text-muted-foreground">After logging in, you'll see your personalized dashboard showing:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Active project assignments</li>
                  <li>Recent time entries</li>
                  <li>Pending expenses</li>
                  <li>Important notifications and alerts</li>
                </ul>
              </section>

              <Separator />

              <section>
                <h2 className="text-2xl font-bold mb-4">Understanding User Roles</h2>
                <p className="text-muted-foreground mb-4">
                  SCDP uses role-based access control to manage permissions. Your role determines which features you can access:
                </p>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold">Employee</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Track time on assigned projects</li>
                      <li>Submit expense reports</li>
                      <li>View your assignments and projects</li>
                      <li>Access your personal workspace</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold">Project Manager (PM)</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>All Employee capabilities</li>
                      <li>Create and manage projects</li>
                      <li>Assign resources to projects</li>
                      <li>Create estimates</li>
                      <li>View project reports and analytics</li>
                      <li>Manage clients</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold">Billing Administrator</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Manage billing and invoicing</li>
                      <li>Process expense reports</li>
                      <li>Manage billing rates</li>
                      <li>Generate financial reports</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold">Executive</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>View portfolio dashboard</li>
                      <li>Access all reports and analytics</li>
                      <li>Review projects and client information</li>
                      <li>Monitor organizational performance</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold">Administrator</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>All system capabilities</li>
                      <li>Manage users and roles</li>
                      <li>Configure system settings</li>
                      <li>Manage vocabulary and templates</li>
                      <li>Access system diagnostics</li>
                    </ul>
                  </div>
                </div>
              </section>

              <Separator />

              <section>
                <h2 className="text-2xl font-bold mb-4">My Workspace</h2>
                <p className="text-muted-foreground mb-4">
                  Your personal workspace provides quick access to your daily tasks and activities.
                </p>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold mb-2">My Dashboard</h3>
                    <p className="text-sm text-muted-foreground mb-2"><strong>Purpose:</strong> Overview of your current work and pending tasks</p>
                    <p className="text-sm font-medium">Key Features:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Active assignments with deadlines</li>
                      <li>Time tracking summary</li>
                      <li>Pending expense submissions</li>
                      <li>Quick access to frequently used features</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-2">My Time</h3>
                    <p className="text-sm text-muted-foreground mb-2"><strong>Purpose:</strong> Track time spent on projects and activities</p>
                    <p className="text-sm font-medium mb-1">Recording Time:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Navigate to "My Time"</li>
                      <li>Select the project and activity</li>
                      <li>Enter the date and hours worked</li>
                      <li>Add description of work performed</li>
                      <li>Click "Submit" to save your time entry</li>
                    </ol>
                    <p className="text-sm font-medium mt-2 mb-1">Tips:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Enter time daily for accuracy</li>
                      <li>Be descriptive in your work descriptions</li>
                      <li>Review your time entries before period end</li>
                      <li>Ensure all time is properly categorized</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-2">My Expenses</h3>
                    <p className="text-sm text-muted-foreground mb-2"><strong>Purpose:</strong> Submit and track expense reimbursements</p>
                    <p className="text-sm font-medium mb-1">Submitting an Expense:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Go to "My Expenses"</li>
                      <li>Click "New Expense"</li>
                      <li>Select the project (if applicable)</li>
                      <li>Choose expense category</li>
                      <li>Enter amount and date</li>
                      <li>Upload receipt image or PDF</li>
                      <li>Add description</li>
                      <li>Click "Submit"</li>
                    </ol>
                    <p className="text-sm font-medium mt-2 mb-1">Expense Status:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li><strong>Pending:</strong> Awaiting approval</li>
                      <li><strong>Approved:</strong> Approved for reimbursement</li>
                      <li><strong>Rejected:</strong> Requires correction or clarification</li>
                      <li><strong>Paid:</strong> Reimbursement processed</li>
                    </ul>
                  </div>
                </div>
              </section>

              <Separator />

              <section>
                <h2 className="text-2xl font-bold mb-4">Tips for Effective Use</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Time Tracking Best Practices</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Enter time daily while work is fresh in your mind</li>
                      <li>Be specific in descriptions for accurate billing</li>
                      <li>Ensure time is properly categorized</li>
                      <li>Submit time entries promptly</li>
                      <li>Review your timesheet before period end</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-2">Project Management Tips</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Keep project information up to date</li>
                      <li>Regularly review resource allocations</li>
                      <li>Monitor budget vs. actual spend</li>
                      <li>Communicate changes promptly</li>
                      <li>Document key decisions and milestones</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-2">Expense Reporting Guidelines</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Submit expenses promptly</li>
                      <li>Always attach receipts</li>
                      <li>Categorize expenses correctly</li>
                      <li>Include detailed descriptions</li>
                      <li>Follow organizational expense policies</li>
                    </ul>
                  </div>
                </div>
              </section>

              <Separator />

              <section>
                <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
                
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold">Q: How do I reset my password?</p>
                    <p className="text-sm text-muted-foreground">A: Contact your IT administrator at ITHelp@synozur.com to request a password reset.</p>
                  </div>

                  <div>
                    <p className="font-semibold">Q: Can I edit time entries after submission?</p>
                    <p className="text-sm text-muted-foreground">A: This depends on your organization's policies. Contact your PM or administrator for guidance.</p>
                  </div>

                  <div>
                    <p className="font-semibold">Q: What file formats are accepted for receipts?</p>
                    <p className="text-sm text-muted-foreground">A: Common image formats (JPG, PNG) and PDF files are supported.</p>
                  </div>

                  <div>
                    <p className="font-semibold">Q: How often should I submit my time?</p>
                    <p className="text-sm text-muted-foreground">A: Best practice is daily, but at minimum weekly to ensure accuracy.</p>
                  </div>

                  <div>
                    <p className="font-semibold">Q: How do I download reports?</p>
                    <p className="text-sm text-muted-foreground">A: Most reports include an export function. Look for download or export buttons within each report view.</p>
                  </div>

                  <div>
                    <p className="font-semibold">Q: Can clients access SCDP?</p>
                    <p className="text-sm text-muted-foreground">A: No, SCDP is for internal use only. Invoices and reports are exported and shared with clients externally.</p>
                  </div>
                </div>
              </section>

              <Separator />

              <section>
                <h2 className="text-2xl font-bold mb-4">Getting Help</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Support Resources</h3>
                    <p className="text-sm font-medium">IT Support</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground mb-3">
                      <li>Email: ITHelp@synozur.com</li>
                      <li>For technical issues, login problems, and general support</li>
                    </ul>
                    
                    <p className="text-sm font-medium">Training</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Contact your manager for onboarding and training resources</li>
                      <li>Refer to this guide for feature documentation</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-2">Technical Issues</h3>
                    <p className="text-sm text-muted-foreground mb-2">If you experience problems:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Refresh your browser</li>
                      <li>Clear browser cache and cookies</li>
                      <li>Try a different browser</li>
                      <li>Log out and log back in</li>
                      <li>Contact IT Support if issue persists</li>
                    </ol>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-2">Reporting Bugs</h3>
                    <p className="text-sm text-muted-foreground mb-2">When reporting issues, include:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Description of the problem</li>
                      <li>Steps to reproduce</li>
                      <li>Expected vs. actual behavior</li>
                      <li>Browser and operating system</li>
                      <li>Screenshots if applicable</li>
                    </ul>
                  </div>
                </div>
              </section>

              <Separator />

              <section className="bg-primary/5 p-6 rounded-lg">
                <h2 className="text-2xl font-bold mb-4">Contact Information</h2>
                <p className="font-semibold mb-2">Synozur IT Support</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground mb-4">
                  <li>Email: ITHelp@synozur.com</li>
                  <li>Website: <a href="https://www.synozur.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">www.synozur.com</a></li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  For questions about login and access issues, technical problems, feature requests, training resources, or general support.
                </p>
              </section>

              <div className="text-center pt-6 pb-2">
                <p className="text-lg font-medium text-muted-foreground">
                  Ready to streamline your consulting delivery? Start using SCDP today!
                </p>
                <p className="text-sm text-muted-foreground italic mt-2">
                  SCDP by Synozur - Delivering Excellence Together
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
