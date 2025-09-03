const { DatabaseStorage } = require('./dist/storage.js');

async function testMilestones() {
  const storage = new DatabaseStorage();
  
  try {
    // Test getting milestones for a non-existent estimate
    const milestones = await storage.getEstimateMilestones('test-estimate-id');
    console.log('Milestones retrieved:', milestones);
    
    // Test creating a milestone
    const newMilestone = {
      estimateId: 'test-estimate-id',
      name: 'Test Milestone',
      description: 'Test description',
      amount: 10000,
      percentage: null,
      dueDate: '2025-03-31',
      sortOrder: 1
    };
    
    console.log('Creating milestone:', newMilestone);
    // const created = await storage.createEstimateMilestone(newMilestone);
    // console.log('Created milestone:', created);
    
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testMilestones();