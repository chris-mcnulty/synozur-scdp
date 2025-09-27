#!/usr/bin/env node

/**
 * Post-build script to copy built files from dist/public to server/public
 * This ensures the production server can find the built files where it expects them
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const source = path.join(rootDir, 'dist', 'public');
const target = path.join(rootDir, 'server', 'public');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    // Read directory and copy each item
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    // Create parent directory for file if it doesn't exist
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    // Copy file
    fs.copyFileSync(src, dest);
  }
}

console.log('📦 Copying built files to server directory...');
console.log(`   Source: ${source}`);
console.log(`   Target: ${target}`);

// Clean the target directory first
if (fs.existsSync(target)) {
  console.log('🧹 Cleaning existing server/public directory...');
  fs.rmSync(target, { recursive: true, force: true });
}

// Check if source exists
if (!fs.existsSync(source)) {
  console.error('❌ Error: Build directory not found at dist/public');
  console.error('   Make sure to run "vite build" first');
  process.exit(1);
}

// Copy files
try {
  copyRecursiveSync(source, target);
  console.log('✅ Successfully copied build files to server/public');
  console.log('   Your deployment will now serve the latest build!');
} catch (error) {
  console.error('❌ Error copying files:', error.message);
  process.exit(1);
}