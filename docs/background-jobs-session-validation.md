# Background Jobs session fix — verification

Verified locally on 2026-10-12. **Publishing is still required. No deployment was initiated and no production job records were modified.**

## Defect evidence

- Before the fix, the real client App/Router/session-recovery hook was exercised in Chromium against intercepted APIs that enforce `x-session-id`.
- The reproduction produced six list requests, all missing the header, six auth checks, and four main-frame navigations in a short visit. The sequence was a list 401, the global unauthorized event, successful auth validation, then a full-page reload of the same defective request.
- Existing deployment logs independently show list requests rejected for missing session IDs and returning 401 at 21:02:53, 21:02:54, 21:03:18 and 21:03:33 UTC on 2026-10-12. Nearby auth-user requests succeeded. These logs confirm the missing-header failure on the deployed build; they do not by themselves prove browser reloads or validate the new fix.

## Implementation

- The list uses shared authenticated transport, preserving type/status parameters, `limit=200`, array validation, useful API messages, safe malformed-row rendering, retained data and error-state polling pause.
- Recovery retains the auth cache and mounted page during validation. Success updates auth data and retries only active queries that failed with an HTTP 401, at most once per query/session in 30 seconds. It does not reload or invalidate successful/unrelated queries.
- Network errors, service errors and malformed validation responses preserve the session. Explicit rejection from the auth endpoint clears cached access and sends the user to login.
- When startup auth fails transiently, the router offers Retry without deleting credentials or rendering protected content. Genuine auth-query 401s also revoke access.

## Local results

All checks passed:

| Check | Result |
| --- | --- |
| `npm run check` | TypeScript passed |
| `npm run test:unit` | 234 passed, 0 failed |
| `npm run test:background-jobs` | Browser regression passed |
| `npx tsx tests/project-time-workbench.browser.ts` | Passed |
| `npx tsx tests/calendar-suggestions.browser.ts` | Passed |
| `npx tsx tests/time-grid-bucket.browser.ts` | Passed |
| `npm run build` | Production frontend and server bundles built |
| `git diff --check` | Passed |

The new suite is included in `test:browser` and therefore `npm test`. It serves the actual application through Vite while intercepting all API calls; it does not start workers or touch database records. It covers initial load, refresh, browser refresh, filters and limit, repeated real five-second polling, authenticated retry/cancel/prune controls, populated and malformed rows, detail expansion and sensitive-prompt truncation, retained data after 503/network/invalid-array failures, paused error polling, manual retry, successful in-place recovery, exactly one recovery retry for persistent list 401s, transient validation failures, confirmed expiration and startup access control. It captures uncaught page errors and unexpected APIs, and checks saved credentials, auth headers and main-frame navigation.

The existing development workflow was restarted and came up successfully. Preview screenshot verification without authentication showed the login page, as expected. The signed-in monitor and expanded details were verified in the intercepted browser suite, not against a live database session. Its screenshot is generated at `generated-artifacts/background-jobs-expanded.png`, outside Git/deployment.

There were no failing baseline checks. The build retains existing warnings about outdated Browserslist data and large bundle chunks; development startup also reports missing SharePoint container environment configuration before its separate container access check succeeds. No changes to those unrelated areas were made.

## Production status and next verification

Deployment metadata reports an existing successful public deployment. A read-only request to its Background Jobs page returned HTTP 200 (the public app shell), **not authenticated monitor verification**.

No authenticated production browser session was available for testing. After an authorized user publishes this change:

1. Sign in as an authorized admin and open Background Jobs.
2. Check that list requests include the current `x-session-id`, return the queue, and retain `limit=200` and selected filters.
3. Refresh, switch both filters, expand rows and watch multiple polling cycles. Confirm no unexpected page navigation, flashing login screen or lost credentials.
4. If testing outage/recovery paths, use browser interception, never edit production job records or intentionally disrupt the production API.
5. Record the deployed build and timestamp of the successful authenticated check before describing the production incident as resolved.
