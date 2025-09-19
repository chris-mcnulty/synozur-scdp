#!/usr/bin/env node

// This script starts the development server properly for Replit
console.log('🚀 Starting SCDP Development Server...');
console.log('Environment:', process.env.NODE_ENV || 'development');

// Set development environment if not set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

// Start the server using child_process
const { spawn } = require('child_process');
const path = require('path');

// Use tsx to run the TypeScript server
const serverPath = path.join(__dirname, 'server', 'index.ts');
console.log('Starting server from:', serverPath);

const server = spawn('npx', ['tsx', serverPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development'
  }
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Server exited with code ${code}`);
    process.exit(code);
  }
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  server.kill('SIGTERM');
  process.exit(0);
});