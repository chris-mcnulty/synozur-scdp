---
name: Authenticated browser mocks
description: Avoid unrelated page crashes when browser-testing authenticated features with intercepted APIs.
---

For full-page browser regressions, mock the responses of every always-mounted widget with the correct response shape; do not rely on a generic empty-array fallback. Capture page errors early, and put a timeout on waits for mocked writes.

**Why:** An unrelated widget can assume a structured API result and crash the whole page. That can make the feature under test appear missing or cause an unbounded wait for a request that never starts.

**How to apply:** When adding intercepted-browser tests for authenticated pages, inspect the always-mounted page components and their API contracts before asserting on the target control. A fallback should expose unhandled API requests instead of silently returning a plausible but wrong shape.

Avoid declaring named helper functions inside callbacks serialized into the browser by Puppeteer.

**Why:** The workspace's TypeScript runner can inject a naming helper (`__name`) into nested declarations. Puppeteer sends only the callback to the browser, where that helper is unavailable; the resulting error is in the test callback, not the app.

**How to apply:** Keep browser-evaluation callbacks self-contained and inline simple logic. Attach an early rejection handler to pending response waits so closing the browser after a click error does not replace the original failure with a page-closed error.

For isolated component browser checks, an intercepted HTML document can load real application components through Vite without adding any test-only routes or authentication bypasses to the app.

**Why:** Loading the complete project page can require unrelated API fixtures. Direct component imports avoid those dependencies, but Vite's React refresh preamble and optimized dependency interop still apply; otherwise the harness can fail before the component mounts.

**How to apply:** Include the React refresh preamble, derive optimized dependency URLs from the running app's transformed modules, and preserve their import conventions. In this environment the optimized React DOM client requires the default export's `createRoot`, not a named ESM import. Treat these failures as harness issues rather than changing production code to accommodate them.