#!/bin/bash
# Development server startup script
# This script ensures NODE_ENV is set to development regardless of global settings

echo "Starting development server..."
echo "Overriding NODE_ENV to development mode"

# Explicitly unset any existing NODE_ENV and set it to development
unset NODE_ENV
export NODE_ENV=development

# Run the TypeScript server with development settings using npx
exec npx tsx server/index.ts