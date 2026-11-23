import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@shared": fileURLToPath(new URL("../shared", import.meta.url)) } },
  test: { include: ["tests/estimate-intelligence.test.ts", "tests/estimate-intelligence-access.test.ts"] },
});
