---
name: Private business deliverables
description: Client estimates and internal pricing outputs must stay out of the open-source repository.
---
Client estimate files, internal pricing, import handoffs, and their generated asset metadata belong in ignored local output locations, not the open-source repository.

**Why:** The user explicitly stated that files like the prepared client estimate do not belong in open source.

**How to apply:** Check ignore rules before generating business deliverables. Preserve local copies when untracking files. Never assume deleting a tracked file or adding an ignore rule removes it from Git history; disclose historical exposure and obtain approval before rewriting shared history. Do not push commits containing private business deliverables.
