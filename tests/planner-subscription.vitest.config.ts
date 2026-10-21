import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: {
    '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    '@': fileURLToPath(new URL('../client/src', import.meta.url)),
  } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['tests/planner-subscription.test.tsx', 'tests/planner-inbound-check.test.ts', 'tests/planner-inbound-polling.test.ts', 'tests/planner-inbound-scheduler.test.ts'] },
});
