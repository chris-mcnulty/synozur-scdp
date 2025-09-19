#!/usr/bin/env node

// Simple Node.js script to run the development server
// This works around the .replit workflow configuration issue

console.log('Starting development server...');
process.env.NODE_ENV = 'development';

const { spawn } = require('child_process');

// Run tsx with the server file
const server = spawn('npx', ['tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' }
});

server.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});