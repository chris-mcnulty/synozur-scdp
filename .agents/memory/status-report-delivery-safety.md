---
name: Unattended status-report delivery safety
description: Why unattended report delivery favors duplicate prevention and explicit external context over permissive recovery.
---

An uncertain email submission must not be retried automatically. Treat provider
acceptance as accepted, not as proof of delivery; distinguish explicit rejection
from a missing acknowledgement.

**Why:** A process can stop after the provider accepts an email but before its
local success record is committed. There is no atomic transaction between
PostgreSQL and the email provider. Automatically replaying that window can send
duplicate client communications. Conservatively withholding a resend is the
chosen tradeoff.

**How to apply:** Preserve the uncertainty state through all retry entry points,
including generic administrative background-job retry. A future reconciliation
flow must use provider evidence and an explicit audited decision rather than
silently reopening unknown submissions.

Client-facing recurring reports must not inherit cached interactive PM context.
Only context explicitly supplied for the external schedule is eligible.

**Why:** Cached notes can contain internal steering and were not explicitly
authorized for recurring external distribution. Merely asking AI to omit private
details is weaker than excluding those source fields before generation.

**How to apply:** Keep external report input as a client-visible projection and
keep internal-note fallback limited to internal report styles.

Review approval must bind the loaded content and frozen recipient list to the
exact project/run selection, even when a cancelled request eventually resolves.

**Why:** Recipient authorization alone cannot prevent a late internal-report
response from replacing a selected client-facing draft's content. Approval could
otherwise submit authorized recipients the wrong audience's report.

**How to apply:** Invalidate old requests on close/selection/project changes,
guard success/error/finalization handlers by identity, and keep approval disabled
until the currently selected identity is the identity actually loaded.

For repeated daylight-saving wall times, select the earliest UTC instance first,
then decide whether it is in the future; do not search for the first match after
the current instant.

**Why:** A delayed poll during clock rollback can see a wall-clock time earlier
than a scheduled first instance that has already elapsed. Searching only future
UTC matches would schedule a second email for the same local occurrence.

**How to apply:** Test recovery in the interval between the two UTC instances,
not only immediately at the first scheduled instant.
