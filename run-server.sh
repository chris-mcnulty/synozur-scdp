#!/bin/bash
# Direct server startup script
echo "=== Starting Development Server ==="
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"

# Force development mode to ensure Vite is disabled (as per the fix in server/index.ts)
export NODE_ENV=development
export DISABLE_VITE_DEV=1
echo "Environment: NODE_ENV=${NODE_ENV}"

# Check if tsx is available
if command -v tsx &> /dev/null; then
    echo "Starting with tsx..."
    exec tsx server/index.ts
else
    echo "tsx not found, using npx..."
    exec npx tsx server/index.ts
fi