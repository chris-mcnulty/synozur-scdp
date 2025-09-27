#!/bin/bash

echo "🚀 Starting full build process..."
echo ""

# Step 1: Run Vite build
echo "📦 Building client with Vite..."
npx vite build

if [ $? -ne 0 ]; then
  echo "❌ Vite build failed"
  exit 1
fi

# Step 2: Copy built files to server/public
echo ""
echo "📋 Copying built files to server directory..."
node scripts/copy-dist.js

if [ $? -ne 0 ]; then
  echo "❌ Failed to copy build files"
  exit 1
fi

# Step 3: Build server with esbuild
echo ""
echo "🔧 Building server with esbuild..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

if [ $? -ne 0 ]; then
  echo "❌ Server build failed"
  exit 1
fi

echo ""
echo "✅ Build complete! Your app is ready for deployment."
echo "   The server will now serve the latest client build from server/public"