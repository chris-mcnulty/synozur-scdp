#!/bin/bash

# Compatibility entry point for older operator documentation.
# package.json owns the build; bundled server resolves public assets in dist/public.
set -euo pipefail
exec npm run build