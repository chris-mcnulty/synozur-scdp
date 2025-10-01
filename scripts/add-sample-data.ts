// Script to add sample data for testing payment milestones and invoicing
import { db } from '../server/db.js';
import { 
  clients, 
  projects, 
  estimates, 
  estimateMilestones,
  projectPaymentMilestones,
  timeEntries,
  expenses,
  users,
  sows,
  projectBudgetHistory
} from '../shared/schema.js';
import { eq } from 'drizzle-orm';

async function addSampleData() {
  try {
    console.log('Adding sample data...');
    
    // Get admin user (assuming one exists)
    const [adminUser] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
    
    if (!adminUser) {
      console.error('No admin user found. Please create an admin user first.');
      return;
    }
    
    // 1. Create a sample client - Safe-Guard
    const existingClient = await db.select().from(clients).where(eq(clients.name, 'Safe-Guard'));
    
    let clientId: string;
    if (existingClient.length > 0) {
      clientId = existingClient[0].id;
      console.log('Using existing Safe-Guard client');
    } else {
      const [safeGuardClient] = await db.insert(clients).values({
        name: 'Safe-Guard',
        status: 'active',
        currency: 'USD',
        billingContact: 'John Smith',
        contactName: 'John Smith',
        contactAddress: '123 Security Blvd, Safety City, SC 12345',
        hasMsa: true,
        msaDate: '2025-01-01'
      }).returning();
      clientId = safeGuardClient.id;
      console.log('Created new Safe-Guard client');
    }
    
    // 2. Create an estimate with milestones
    const [safeGuardEstimate] = await db.insert(estimates).values({
      name: 'Safe-Guard Security System Implementation',
      clientId: clientId,
      projectType: 'fixed-fee',
      status: 'approved',
      totalAmount: '7000',
      totalHours: '70',
      validUntil: '2025-12-31',
      notes: 'Implementation of security management system',
      contingencyPercent: '10',
      isChangeOrder: false
    }).returning();
    
    // 3. Create estimate milestones
    const milestoneData = [
      { name: 'Project Kickoff & Requirements', amount: '2000', dueDate: '2025-01-15', sortOrder: 1 },
      { name: 'Design & Architecture', amount: '2000', dueDate: '2025-02-15', sortOrder: 2 },
      { name: 'Development Phase 1', amount: '2000', dueDate: '2025-03-15', sortOrder: 3 },
      { name: 'Final Delivery & Testing', amount: '1000', dueDate: '2025-04-15', sortOrder: 4 }
    ];
    
    for (const milestone of milestoneData) {
      await db.insert(estimateMilestones).values({
        estimateId: safeGuardEstimate.id,
        name: milestone.name,
        description: `Milestone for ${milestone.name}`,
        amount: milestone.amount,
        dueDate: milestone.dueDate,
        sortOrder: milestone.sortOrder,
        status: 'pending'
      });
    }
    
    // 4. Create a project from the estimate
    const [safeGuardProject] = await db.insert(projects).values({
      name: 'Safe-Guard Security Implementation',
      code: 'SG-001',
      clientId: clientId,
      status: 'active',
      startDate: '2025-01-01',
      endDate: '2025-04-30',
      commercialScheme: 'milestone', // Required field: retainer, milestone, or tm
      baselineBudget: '7000',
      sowValue: '7000',
      sowDate: '2025-01-01',
      hasSow: true,
      estimatedTotal: '7000',
      sowTotal: '7000',
      actualCost: '0',
      billedTotal: '0',
      profitMargin: '0',
      pm: adminUser.id
    }).returning();
    
    // 5. Create SOW
    const [safeGuardSOW] = await db.insert(sows).values({
      projectId: safeGuardProject.id,
      type: 'initial',
      name: 'Initial SOW - Safe-Guard Security Implementation',
      description: 'Statement of Work for security system implementation',
      value: '7000',
      hours: '70',
      signedDate: '2025-01-01',
      effectiveDate: '2025-01-01',
      expirationDate: '2025-12-31',
      status: 'approved',
      approvedBy: adminUser.id,
      approvedAt: new Date(),
      terms: 'Net 30',
      scopeOfWork: 'Security management system with all specified features'
    }).returning();
    
    // 6. Copy milestones from estimate to project payment milestones
    const estimateMilestonesList = await db.select()
      .from(estimateMilestones)
      .where(eq(estimateMilestones.estimateId, safeGuardEstimate.id));
    
    for (const em of estimateMilestonesList) {
      await db.insert(projectPaymentMilestones).values({
        projectId: safeGuardProject.id,
        estimateMilestoneId: em.id,
        name: em.name,
        description: em.description,
        amount: em.amount,
        dueDate: em.dueDate,
        status: 'planned',
        sowId: safeGuardSOW.id,
        sortOrder: em.sortOrder
      });
    }
    
    // 7. Add initial budget history entry
    await db.insert(projectBudgetHistory).values({
      projectId: safeGuardProject.id,
      changeType: 'sow_approval',
      fieldChanged: 'baselineBudget',
      previousValue: '0',
      newValue: '7000',
      deltaValue: '7000',
      sowId: safeGuardSOW.id,
      changedBy: adminUser.id,
      reason: 'Initial project budget from approved SOW',
      metadata: { sowName: safeGuardSOW.name, sowType: 'initial' }
    });
    
    // 8. Add time entries (40 hours @ $175/hr = $7000, plus Michelle's non-billable time)
    const timeEntryData = [
      { date: '2025-01-05', hours: '8', description: 'Requirements gathering', personId: adminUser.id, billable: true, billingRate: '175', workstream: 'Development' },
      { date: '2025-01-10', hours: '8', description: 'System design', personId: adminUser.id, billable: true, billingRate: '175', workstream: 'Development' },
      { date: '2025-01-15', hours: '8', description: 'Architecture planning', personId: adminUser.id, billable: true, billingRate: '175', workstream: 'Development' },
      { date: '2025-01-20', hours: '8', description: 'Development setup', personId: adminUser.id, billable: true, billingRate: '175', workstream: 'Development' },
      { date: '2025-01-25', hours: '8', description: 'Core module development', personId: adminUser.id, billable: true, billingRate: '175', workstream: 'Development' },
      // Michelle's extra time (non-billable)
      { date: '2025-02-01', hours: '20', description: 'Additional review and support (Michelle)', personId: adminUser.id, billable: false, billingRate: '0', workstream: 'Management' },
      // More non-billable time
      { date: '2025-02-05', hours: '10', description: 'Extra consultation (non-billable)', personId: adminUser.id, billable: false, billingRate: '0', workstream: 'Management' }
    ];
    
    for (const entry of timeEntryData) {
      await db.insert(timeEntries).values({
        projectId: safeGuardProject.id,
        personId: entry.personId,
        date: entry.date,
        hours: entry.hours,
        description: entry.description,
        billable: entry.billable,
        billingRate: entry.billingRate,
        costRate: '100',
        approvedFlag: true,
        lockedFlag: false,
        workstream: entry.workstream,
        phase: 'Implementation'
      });
    }
    
    // 9. Add some expenses (these should NOT count against hours budget)
    const expenseData = [
      { date: '2025-01-10', amount: '500', category: 'software', description: 'Security software licenses', billable: true },
      { date: '2025-01-15', amount: '300', category: 'hardware', description: 'Testing equipment', billable: true },
      { date: '2025-02-01', amount: '200', category: 'travel', description: 'Client site visit', billable: false }
    ];
    
    for (const expense of expenseData) {
      await db.insert(expenses).values({
        projectId: safeGuardProject.id,
        personId: adminUser.id,
        date: expense.date,
        amount: expense.amount,
        category: expense.category,
        description: expense.description,
        billable: expense.billable,
        reimbursable: true,
        currency: 'USD',
        status: 'approved',
        approvedBy: adminUser.id,
        approvedAt: new Date()
      });
    }
    
    console.log('Sample data added successfully!');
    console.log('Created:');
    console.log('- Client: Safe-Guard');
    console.log('- Project: Safe-Guard Security Implementation ($7000 budget)');
    console.log('- 4 Payment Milestones ($2000, $2000, $2000, $1000)');
    console.log('- 40 billable hours @ $175/hr = $7000');
    console.log('- 30 non-billable hours (Michelle\'s extra time)');
    console.log('- $1000 in expenses (should not affect hours budget)');
    console.log('\nYou can now:');
    console.log('1. View the project and see payment milestones');
    console.log('2. Generate an invoice from a milestone');
    console.log('3. Add invoice lines and finalize the batch');
    console.log('4. Test the QuickBooks CSV export');
    
  } catch (error) {
    console.error('Error adding sample data:', error);
  } finally {
    process.exit(0);
  }
}

addSampleData();