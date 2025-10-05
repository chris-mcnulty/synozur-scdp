#!/bin/bash
# Start the development server
echo "Starting development server..."
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "Environment: NODE_ENV=${NODE_ENV}"

# Override NODE_ENV to development for proper startup
export NODE_ENV=development

# Start the server with tsx directly
echo "Starting server with tsx..."
exec npx tsx server/index.ts