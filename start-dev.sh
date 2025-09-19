#!/bin/bash

# Development server startup script
echo "Starting development server..."
echo "Setting NODE_ENV to development"
export NODE_ENV=development

# Run the dev server with tsx
echo "Starting server with tsx..."
npx tsx server/index.ts