#!/usr/bin/env node
const { execSync } = require('child_process');

// Start the server in the background
console.log('Starting development server...');
const serverProcess = require('child_process').spawn('npm', ['run', 'dev'], {
  cwd: '/home/runner/workspace',
  env: { ...process.env, NODE_ENV: 'development' },
  detached: true,
  stdio: 'inherit'
});

console.log('Server process started with PID:', serverProcess.pid);
console.log('Server should be accessible at http://localhost:5000');
console.log('Please test the vocabulary features manually:');
console.log('1. Login to the application');
console.log('2. Go to Time Tracking and check if Stage/Workstream labels update based on selected project');
console.log('3. Export time entries to Excel and check column headers');
console.log('4. Create an invoice batch and check if vocabulary is used in descriptions');

// Keep the script running
setTimeout(() => {
  console.log('Test script complete. Server is still running in background.');
  process.exit(0);
}, 5000);