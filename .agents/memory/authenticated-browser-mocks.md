---
name: Authenticated browser mocks
description: Avoid unrelated page crashes when browser-testing authenticated features with intercepted APIs.
---

For full-page browser regressions, mock the responses of every always-mounted widget with the correct response shape; do not rely on a generic empty-array fallback. Capture page errors early, and put a timeout on waits for mocked writes.

**Why:** An unrelated widget can assume a structured API result and crash the whole page. That can make the feature under test appear missing or cause an unbounded wait for a request that never starts.

**How to apply:** When adding intercepted-browser tests for authenticated pages, inspect the always-mounted page components and their API contracts before asserting on the target control. A fallback should expose unhandled API requests instead of silently returning a plausible but wrong shape.