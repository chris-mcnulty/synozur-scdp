import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@shared": fileURLToPath(new URL("../shared", import.meta.url)) } },
  test: { include: ["tests/report-schedules.test.ts", "tests/report-schedules.integration.test.ts"], fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 },
});
