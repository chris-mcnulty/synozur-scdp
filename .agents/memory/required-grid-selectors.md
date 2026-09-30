---
name: Required grid selectors
description: Why an unselected required grid dropdown may close without committing its first choice.
---

When a controlled Radix Select starts without a value inside a grid cell, its close notification can precede the option-selection callback. If closing immediately unmounts the cell editor, the first selection is lost.

**Why:** This surfaced specifically on required project classifications: optional selectors already had a placeholder value and worked, while the required first choice disappeared without a save request.

**How to apply:** For required grid selectors, give the choice callback a chance to commit before treating a close notification as cancellation. Include a browser test starting from an empty required selection, not only edits to an existing classified row.