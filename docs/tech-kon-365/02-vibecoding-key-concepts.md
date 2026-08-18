# Vibecoding, Done Right: Key Concepts for AI-Assisted Software Delivery

*Tech Kon 365 — Seattle*
*Companion deck source document. This is written to be fed to an AI agent building presentation slides. Each top-level section is a candidate slide or slide group; the bullets are candidate talking points.*

---

## What This Talk Covers

"Vibecoding" — building real software by describing what you want to an AI and steering it, rather than hand-writing every line — is now a legitimate way to ship production systems. Constellation, the platform shown in the companion architecture talk, was built this way. But "vibe" does not mean "no discipline." The teams that succeed treat the AI as a very fast, very literal junior engineer who needs the same guardrails any junior engineer needs: a clear design, a prioritized backlog, source control, security review, and someone who understands the database underneath.

This document lays out the concepts that keep AI-assisted development from turning into an unmaintainable pile of code that works today and breaks silently tomorrow. It is aimed at builders who may come from a business, consulting, or design background rather than a traditional computer-science one — people who have never opened GitHub and are not sure what a "merge" actually is. Those concepts are explained here in plain language.

**The core message:** AI writes the code fast. Your job is to own the *system* — the design, the priorities, the security posture, and the source of truth. That ownership is what separates a durable product from a demo.

---

## 1. Keep Design and Build Separate

The single most important habit. Decide *what* you are building and *why* before you let the AI decide *how*.

- **Design first, in words and pictures.** Write down the problem, the users, the screens, the data, and the rules — before any code is generated. A one-page spec or a rough diagram is enough. If you cannot describe it, the AI cannot build the right thing; it will build *a* thing.
- **Design and build are different modes of thinking.** Design is divergent and reversible — you are exploring. Build is convergent and expensive to undo — you are committing. Mixing them means you make architectural decisions by accident, mid-prompt, while thinking about a button color.
- **Use a "plan mode" before an "edit mode."** Tools like Claude Code have an explicit planning step: the AI proposes an approach and you approve it *before* it touches files. Use it. Approve the plan, then let it build.
- **The AI is happy to build the wrong thing beautifully.** It has no opinion about whether the feature should exist. That judgment is yours, and it belongs in the design phase, not discovered halfway through the build.
- **Separation makes review possible.** When design is written down, you can check the finished code *against the design*. With no design, "is this right?" has no answer — there is nothing to compare it to.

---

## 2. Backlog and Roadmap: Know What's Next and What's Later

AI makes it trivially easy to build the next shiny thing right now. That is exactly why you need a backlog and a roadmap — to protect your future self from your present enthusiasm.

- **Backlog = the prioritized list of what to build next.** Every idea, bug, and request goes in one place, ranked. You work the top of the list, not whatever you thought of five minutes ago. (Constellation keeps this in a single `backlog.md` checked into the repo.)
- **Roadmap = the strategic direction over quarters.** Where is the product going this quarter, this half, next year? The roadmap keeps individual features pointed at a larger goal instead of sprawling in every direction.
- **Check the backlog before you build.** With an AI you can accidentally rebuild something that already exists, or build something that conflicts with planned work. A quick look at the backlog first prevents wasted effort and contradictions.
- **Write it down where the AI can read it.** When the backlog and roadmap live in the repository as plain files, your AI assistant can read them and keep new work consistent with what's planned. The plan becomes part of the AI's context, not just yours.
- **"Later" is a valid, powerful answer.** A backlog lets you say "good idea — it goes here, position 14" instead of dropping everything. Speed of building is not a reason to abandon prioritization; it's a reason to need it more.

---

## 3. Maintenance: Software Is Never "Done"

The demo is the first 20%. The other 80% is keeping it alive: dependency updates, security patches, bug fixes, data migrations, and the slow accumulation of small changes.

- **AI-generated code still ages.** Libraries release breaking changes, security advisories land, and APIs you depend on get deprecated. Someone has to notice and respond. Generating the code faster does not make it maintenance-free.
- **Favor code you (or your AI) can re-read later.** Maintainable code is boring code: clear names, consistent patterns, small pieces. Ask the AI to match the style already in the codebase rather than inventing a new approach each time.
- **Keep a changelog.** A running record of what shipped and when (Constellation keeps a `CHANGELOG.md`) turns "why did this break?" from an archaeology project into a lookup.
- **Documentation is part of maintenance, not an afterthought.** In-app help and a living user guide mean the next person — including future-you — can understand the system without reverse-engineering it.
- **Budget for it.** Plan capacity for maintenance the same way you plan capacity for features. A product that only gets new features and never gets maintained is quietly rotting.

---

## 4. Database Architecture: Respect the Source of Truth

Screens come and go; the database is forever. It is the one part of the system where mistakes are hardest to reverse, because it holds the real, accumulated data of real users.

- **Design the data model deliberately.** What are the core entities (users, projects, invoices…)? How do they relate? Get the shape of the data right early — it is far cheaper to change a screen than to restructure a table full of production data.
- **Use a schema and migrations, not ad-hoc changes.** A defined schema (Constellation uses Drizzle ORM with typed schemas and Zod validation) means every change to the database structure is written down, versioned, and repeatable — not typed live into a console and forgotten.
- **Validate at the boundary.** Data coming in from users or other systems should be checked against a schema before it is trusted. This is where a lot of "mystery bugs" and security holes actually live.
- **Isolation and tenancy are data-model decisions.** If you serve multiple customers, *how* their data is separated is an architecture choice made in the data layer — not a checkbox added later. (See the companion architecture talk for per-tenant isolation.)
- **The AI does not know your data's meaning.** It knows SQL syntax; it does not know that `status = 'L'` means "locked" and must never be flipped in bulk. You hold that meaning. Guard it.

---

## 5. Security Principles: Especially "No Hardcoded Credentials"

AI assistants are trained on billions of lines of public code, including a lot of insecure code and a lot of tutorials that cut corners "just to make it work." They will happily reproduce those shortcuts. Security is the area where you must actively supervise the machine.

- **Never hardcode credentials. Ever.** Passwords, API keys, connection strings, tokens — these belong in environment variables or a secrets manager, never typed into source code. Code gets committed, shared, and pushed to GitHub; a hardcoded secret is a secret published to everyone with access to the repo (and sometimes the whole internet).
- **Actively hunt for the shortcut — especially with agents.** AI coding *agents* run multi-step and move fast; when they hit an auth wall, the path of least resistance is to paste the key inline to get unblocked. Treat every diff as a place a secret might have leaked in. Search for it. Make "did this introduce a hardcoded credential?" a standing review question.
- **Least privilege everywhere.** Give the code, the service, and the AI agent the *minimum* access needed. A read-only task should have read-only access. An agent that only needs to query should never hold write credentials.
- **Secrets don't belong in prompts or logs, either.** Don't paste production keys into a chat with an AI, and don't let the app log them. If a secret shows up in a log file or a transcript, treat it as compromised and rotate it.
- **Rotate on exposure, no exceptions.** If a credential is ever committed, screenshotted, pasted, or logged — rotate it. "It was only for a second" is not a security model.
- **Validate and sanitize all input.** Trusting input is how injection attacks happen. The database schema and input validation from Section 4 are your front line.
- **Make security a review gate, not a hope.** Run a security review pass on changes before they ship. The cost of finding a leaked key in review is minutes; the cost of finding it after it's live is a breach.

---

## 6. Source Code Management: What GitHub Actually Is (Plain-Language Primer)

If you come from a non-coding background, this is the concept most likely to be a black box. It is worth understanding, because it is the backbone of doing AI-assisted development safely.

- **A repository ("repo") is the project's home base.** It's a folder that holds all the code *plus its entire history* — every version, every change, who made it and when. Nothing is ever truly lost.
- **A commit is a labeled snapshot.** Each time you save meaningful progress, you make a commit with a short message ("Add invoice export"). You can always go back to any previous snapshot. It's an undo history that never expires.
- **A branch is a safe parallel copy.** Instead of changing the live code directly, you make a branch — a private workspace where you (or your AI) can experiment and break things without affecting what's running. This whole talk's changes live on a branch.
- **A merge is how a finished change rejoins the main line.** When the work on a branch is reviewed and good, you *merge* it back into the main branch — that's the moment your change becomes part of the official product. **A merge, ultimately, is the controlled, reviewable event where "my experiment" becomes "the real thing."** If two people changed the same line, the merge is where that conflict surfaces and gets resolved deliberately — rather than one person silently overwriting the other.
- **Why this matters for vibecoding:** AI writes a *lot* of code, fast. Source control is what lets you accept it in reviewable chunks, undo a bad idea cleanly, see exactly what the AI changed, and never wonder "what did this used to look like?" Without it, AI velocity becomes AI chaos.
- **GitHub is the shared, hosted home for repos.** It's where the repo lives online so a team (and tools, and AI reviewers) can all work against the same source of truth, propose changes, and review them before they merge.

---

## 7. A Working Division of Labor Across AI Tools

No single tool is best at everything. The practical setup used to build Constellation splits the work across tools by their strengths — each doing what it's good at, with a human steering.

- **Claude Code / Cursor — primary ideation and scaffolding.** This is where the thinking and the first build happen: turning a design into working structure, generating whole features, refactoring, and reasoning across the whole codebase. Highest-leverage, most-supervised work. This is your main workshop.
- **GitHub Copilot — code review and simple bug fixes.** A second set of eyes on pull requests and a quick fixer for small, well-scoped bugs. It's excellent at catching the small stuff inline and suggesting focused corrections, which frees the primary tools for the harder design work.
- **Replit — CI/CD and complex error handling.** Replit runs the pipeline that builds, tests, and deploys, and it's where the gnarly production problems get solved — **because that environment has access to both the code *and*, in production, a read-only view of the live data and the operating logs.** That combination is what makes it uniquely suited to diagnosing complex, real-world errors: you can see the failing code and the actual data and log trail that triggered it, side by side.
- **Why split at all?** Different tools have different context, different guardrails, and different access. Matching the tool to the task — ideation vs. review vs. production diagnosis — gives you better results than forcing one tool to do everything, and it keeps sensitive access (like production data) confined to the tool that genuinely needs it.
- **The human is the integrator.** You move the work between tools, keep the design and backlog coherent, and make the final calls. The tools are specialists; you are the general contractor.

---

## 8. Database Literacy: Read Freely, Write Carefully

Even if you never write application code by hand, you should be able to read your own database with a SQL console — and you should treat writing to it with real caution. This is the difference between *knowing* what's happening in your system and *hoping*.

- **`SELECT` is how you ask the database a question.** It reads data and changes nothing. `SELECT * FROM projects WHERE status = 'active';` means "show me every active project." Reads are safe — you can run them all day, explore freely, and never hurt anything. Get comfortable here first.
- **`UPDATE` (and `DELETE`, and `INSERT`) change the data — handle with care.** `UPDATE invoices SET status = 'paid' WHERE id = 123;` changes real records. These are powerful and largely irreversible without a backup.
- **The one habit that saves you: `WHERE` before you commit.** An `UPDATE` or `DELETE` with no `WHERE` clause hits *every row in the table*. "Mark this one invoice paid" and "mark every invoice paid" differ by one missing line. Always write and check the `WHERE` first.
- **Read it back as a `SELECT` before you write it as an `UPDATE`.** Run the `WHERE` clause as a `SELECT` to see exactly which rows you're about to change. If the count looks wrong, stop. This turns a scary write into a verified one.
- **Prefer read-only access for exploration and for AI.** When you or an agent just need to *understand* the system, use a read-only connection. Write access should be deliberate, scoped, and rare — the same least-privilege principle from Section 5.
- **Never let an AI run bulk writes unsupervised.** An agent generating an `UPDATE` across a production table is exactly the moment to slow down, read the `WHERE`, and confirm the row count yourself. Speed is the enemy here.

---

## The Through-Line

AI collapses the cost of *writing* code to nearly zero. It does nothing to reduce the cost of getting the *system* wrong — a bad design, a leaked credential, an unreviewed merge, a `WHERE`-less `UPDATE`. Those costs are as high as ever, and they land faster now because the code arrives faster.

So the discipline shifts up a level. You are no longer paid to type. You are paid to own the design, guard the security boundary, curate the backlog, respect the database, and keep a clean, reviewable history of every change. Do that, and vibecoding is a genuine superpower. Skip it, and you've just built your future problems at record speed.
