---
name: Test runner transforms
description: JSX transform failures when application and test-runner Vite versions differ.
---
Do not assume the application's Vite transform configuration applies to the test runner's bundled Vite.

**Why:** Vitest 4 used a newer bundled Vite with Oxc while the application used Vite 5. Setting esbuild JSX options in the test configuration was ignored, leaving JSX untransformed under the project's `jsx: preserve` setting and causing a parse error before any tests ran.

**How to apply:** Check the test runner's actual transform engine when JSX tests fail before execution. For an Oxc-based runner, configure the JSX runtime through Oxc rather than relying on esbuild settings. Keep the application toolchain unchanged unless it independently needs an upgrade.
