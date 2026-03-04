# AI Estimate Generation — Grounding Document

**Purpose:** This document provides the reference context for Constellation's AI-powered estimate generation feature. When a user uploads a narrative description of a project proposal, the AI uses this grounding document to select appropriate roles, estimate hours, assign contingency factors, and produce a structured estimate with line items.

---

## 1. Consulting Practice Overview

Synozur is a professional services consultancy specializing in digital transformation, Microsoft 365 platform solutions, custom software development, business process automation, data engineering, and organizational change management. Engagements range from 2-week tactical assessments to 18-month enterprise transformation programs.

### Engagement Models

| Model | Description | Typical Duration | Billing |
|-------|-------------|-----------------|---------|
| **Time & Materials (T&M)** | Billed on actual hours at agreed rates | 1–12 months | Hourly against line items |
| **Fixed Price** | Billed against milestones and deliverables | 2–6 months | Milestone-based |
| **Retainer** | Monthly reserved capacity (hour block) | Ongoing | Monthly fixed fee |
| **Program** | Large multi-workstream staffing plan (>$1M) | 6–18 months | Week-based staffing blocks |

---

## 2. Role Catalog

The role catalog defines the standard consulting roles, their billing rates (charged to the client), and internal cost rates (used for margin calculation). When generating an estimate, the AI should select the most appropriate role for each task based on the work description.

### Standard Roles and Rates

| Role | Billing Rate ($/hr) | Cost Rate ($/hr) | Salaried | Typical Responsibilities |
|------|---------------------|-------------------|----------|--------------------------|
| **Principal** | $400 | $325 | Yes | Executive sponsorship, strategic advisory, stakeholder management, governance. Typically 5–10% of project hours. |
| **Transformation Office Lead** | $400 | $350 | No | Large-scale organizational change programs, multi-workstream coordination, PMO leadership. |
| **Senior Architect** | $275 | $200 | Yes | Solution architecture, technology strategy, platform design, technical governance. |
| **Architect** | $300 | $225 | No | System architecture, integration design, technical feasibility, proof-of-concept development. |
| **Generic Consultant** | $300 | $225 | No | Placeholder role for proposals where specific role assignment is deferred. |
| **Lead Developer** | $250 | $200 | No | Technical team leadership, code reviews, complex feature development, DevOps. |
| **Project Manager** | $225 | $175 | No | Day-to-day project execution, status reporting, risk management, stakeholder communication. |
| **UX/Product Lead** | $225 | $175 | No | User experience research, product strategy, design systems, usability testing. |
| **AI Specialist** | $225 | $175 | No | AI/ML solution design, model integration, prompt engineering, AI governance. |
| **PM (Light PM)** | $200 | $150 | No | Coordination, scheduling, meeting facilitation — lighter-touch PM for smaller engagements. |
| **Senior Developer** | $200 | $150 | No | Feature development, technical implementation, mentoring junior staff. |
| **Tech/PM** | $200 | $150 | No | Hybrid technical and project management for technically-driven projects. |
| **Data Engineer** | $200 | $150 | No | Data pipelines, ETL, data modeling, Power BI, analytics infrastructure. |
| **Content Team** | $200 | $150 | No | Content strategy, migration planning, taxonomy, information architecture. |
| **Delivery** | $200 | $150 | No | General delivery work, documentation, process execution. |
| **Finance Lead** | $200 | $150 | No | Financial planning, budgeting, and reporting for large programs. |
| **Business Analyst** | $175 | $125 | No | Requirements gathering, process mapping, user stories, acceptance criteria. |
| **Designer** | $175 | $125 | No | Visual design, branding, UI mockups, design comps. |
| **Developer Architect** | $175 | $125 | No | Mid-level development with architectural responsibility on smaller projects. |
| **Program Manager** | $175 | $125 | No | Coordination across multiple parallel workstreams within a program. |
| **Ops Consultant (RPA)** | $175 | $125 | No | Robotic process automation, Power Automate, process optimization. |
| **Developer** | $150 | $100 | No | Front-end and back-end development, bug fixes, testing. |
| **QA Engineer** | $150 | $100 | No | Test planning, test execution, automation, quality assurance. |
| **Trainer/Coach** | $150 | $100 | No | End-user training, adoption coaching, documentation, change management support. |

### Role Selection Guidance

When reading a project narrative, match tasks to roles using these principles:

1. **Strategic/Advisory work** → Principal or Transformation Office Lead
2. **Architecture decisions** → Senior Architect or Architect
3. **Technical team leadership** → Lead Developer or Developer Architect
4. **Project management** → Project Manager (large) or PM (small/medium)
5. **Hands-on development** → Senior Developer (complex), Developer (standard), or Lead Developer (leading a team)
6. **Design and UX** → UX/Product Lead (strategy), Designer (execution)
7. **Data and analytics** → Data Engineer
8. **AI and machine learning** → AI Specialist
9. **Testing** → QA Engineer
10. **Requirements and analysis** → Business Analyst
11. **Training and adoption** → Trainer/Coach
12. **Content and documentation** → Content Team
13. **Automation** → Ops Consultant (RPA)
14. **General catch-all** → Generic Consultant (avoid if a specific role fits)

### Salaried Resources

Roles marked as "Salaried" (Principal, Senior Architect) have their cost rates tracked in the system for reference, but salaried resources are treated differently in margin calculations: their time is not counted as a direct project cost since their compensation is fixed regardless of project assignment. In practice, this means projects with significant Principal or Senior Architect hours show higher effective margins. They still have a billing rate charged to the client.

---

## 3. Estimate Structure

### Hierarchy

Every estimate is organized into a three-level hierarchy:

```
Estimate
  └── Epics (major phases or workstreams)
        └── Stages (sub-phases or milestones within an epic)
              └── Line Items (individual tasks or activities)
```

**Epics** represent the largest logical groupings. For example: "Discovery & Planning", "Design & Build", "Testing & QA", "Training & Deployment".

**Stages** break epics into meaningful deliverable milestones. For example, under "Design & Build" you might have: "Architecture Sprint", "Sprint 1", "Sprint 2", "Sprint 3".

**Line Items** are the individual task-level entries with hours, rates, and assigned roles.

### Common Epic Templates

When breaking down a narrative proposal, consider these common epic patterns:

**Technology Implementation Projects:**
1. Discovery & Requirements
2. Architecture & Design
3. Development (Sprints)
4. Testing & QA
5. Migration / Data
6. Training & Deployment
7. Hypercare / Post-Go-Live

**Organizational Change / Transformation:**
1. Assessment & Current State
2. Future State Design
3. Change Management Planning
4. Implementation
5. Training & Adoption
6. Measurement & Optimization

**Platform Governance / Advisory:**
1. Audit & Assessment
2. Strategy & Roadmap
3. Policy Development
4. Implementation Support
5. Ongoing Advisory

**Content Migration:**
1. Inventory & Analysis
2. Taxonomy Design
3. Migration Planning
4. Content Transformation
5. Migration Execution
6. Validation & Cleanup

---

## 4. Line Item Fields

Each line item captures:

| Field | Description | Example |
|-------|-------------|---------|
| **Description** | What the task is | "Conduct stakeholder interviews" |
| **Epic** | Parent epic | "Discovery & Requirements" |
| **Stage** | Parent stage | "Stakeholder Engagement" |
| **Role** | Who does this work | "Business Analyst" |
| **Base Hours** | Raw estimated hours | 16 |
| **Factor** | Multiplier (repetition) | 4 (e.g., 4 interviews × 4 hrs each) |
| **Rate** | Billing rate (auto from role) | $175 |
| **Cost Rate** | Internal cost (auto from role) | $125 |
| **Size** | Small / Medium / Large | "Medium" |
| **Complexity** | Simple / Medium / Complex | "Medium" |
| **Confidence** | High / Medium / Low | "High" |
| **Workstream** | Optional workstream label | "User Research" |
| **Week** | Target week number | 2 |

### Adjusted Hours Calculation

```
Adjusted Hours = Base Hours × Factor × Size Multiplier × Complexity Multiplier × Confidence Multiplier
```

Default multiplier values:

| Factor | Small/Simple/High | Medium | Large/Complex/Low |
|--------|-------------------|--------|---------------------|
| **Size** | 1.00× | 1.05× | 1.10× |
| **Complexity** | 1.00× | 1.05× | 1.10× |
| **Confidence** | 1.00× | 1.10× | 1.20× |

These three factors compound. A line item that is Large size, Complex, and Low confidence would have a combined multiplier of 1.10 × 1.10 × 1.20 = **1.452×**.

### When to Apply Contingency Factors

- **Size = Medium/Large**: When the scope of a single task is broader than typical (e.g., "Build integrations" vs. "Build one API endpoint")
- **Complexity = Medium/Complex**: When technical uncertainty, unfamiliar technology, or complex business logic is involved
- **Confidence = Medium/Low**: When requirements are vague, the client hasn't decided, or significant unknowns exist

---

## 5. Hour Estimation Guidelines

### Typical Hours by Activity Type

These ranges help calibrate the AI's estimates based on common consulting activities:

| Activity | Typical Range | Notes |
|----------|--------------|-------|
| Stakeholder interview (each) | 2–4 hrs | Including prep and notes |
| Workshop facilitation (each) | 4–8 hrs | Including prep, facilitation, and summary |
| Requirements document | 16–40 hrs | Depends on scope; larger for enterprise |
| Solution architecture document | 24–60 hrs | Includes research, diagramming, review |
| Sprint (2-week development) | 60–80 hrs/dev | Per developer per sprint |
| Code review and refactoring | 8–16 hrs/sprint | Per reviewing resource |
| UI/UX design for a feature | 16–40 hrs | Wireframes through final comp |
| User research (full cycle) | 40–80 hrs | Interviews, synthesis, personas, journey maps |
| Test plan creation | 8–24 hrs | Per major module |
| Test execution (per sprint) | 20–40 hrs | For one QA engineer |
| Training curriculum development | 16–40 hrs | Per module |
| Training delivery (per session) | 2–4 hrs | Plus 4–8 hrs prep for first delivery |
| Data migration planning | 24–60 hrs | Analysis, mapping, transformation rules |
| Data migration execution | 40–120 hrs | Depends on volume and complexity |
| Project kickoff | 4–8 hrs | PM time for planning and conducting |
| Weekly status reporting | 2–4 hrs/week | PM time per reporting cycle |
| Change management plan | 16–32 hrs | Stakeholder analysis, comms plan, timeline |
| Governance framework | 24–48 hrs | Policies, procedures, RACI, decision trees |
| Power BI dashboard | 16–40 hrs | Per dashboard (data model + visuals) |
| API integration (per system) | 24–60 hrs | Design, build, test per integration point |
| SharePoint site build (each) | 8–24 hrs | Configuration, permissions, content |

### Staffing Ratios

For properly staffed projects, use these approximate ratios:

- **PM allocation**: 10–20% of total project hours (higher for complex/risky projects)
- **Architecture**: 5–15% of total hours (front-loaded in early phases)
- **Principal/Executive**: 3–8% of total hours (steering committee, escalations)
- **QA**: 15–25% of development hours
- **Training**: 5–10% of total project hours

### Small / Medium / Large Project Sizing

| Size | Total Hours | Duration | Typical Team |
|------|------------|----------|--------------|
| **Small** | 100–300 hrs | 2–6 weeks | 1–2 consultants |
| **Medium** | 300–1,000 hrs | 2–4 months | 3–5 consultants |
| **Large** | 1,000–3,000 hrs | 4–9 months | 5–10 consultants |
| **Program** | 3,000+ hrs | 6–18 months | 10+ consultants |

---

## 6. Program Estimates (Staffing Blocks)

For very large engagements (>$1M), use Program estimate type instead of detailed line items. Program estimates use week-based staffing blocks:

| Field | Description |
|-------|-------------|
| **Role/Resource** | The role or named person |
| **Start Week** | When the block begins (week 0 = project start) |
| **Duration (weeks)** | How many weeks the block runs |
| **Utilization %** | 20% (8 hrs/wk), 40% (16), 60% (24), 80% (32), 100% (40) |
| **Epic / Stage** | Which workstream the block supports |

Program blocks should reflect realistic staffing patterns:
- Architects: high utilization early (weeks 0–8), tapering to advisory (20%) later
- Developers: ramp up after architecture is set (week 4+), full utilization in build sprints
- PM: consistent 40–60% utilization throughout
- Principal: 20% for governance and steering throughout
- QA: ramp up in testing phases (40–80%)
- Trainers: late-phase engagement (final 4–6 weeks)

---

## 7. Common Proposal Patterns

When analyzing a narrative, look for these common patterns and map them to the appropriate estimate structure:

### Pattern: "Assess and recommend"
→ Short engagement (100–200 hrs), heavy on BA and Architect, minimal development. Epics: Assessment, Analysis, Recommendations.

### Pattern: "Build a custom application"
→ Medium-to-large engagement. Epics: Discovery, Design, Build (multiple sprints), Test, Deploy. Developers are the largest cost center.

### Pattern: "Migrate to a new platform"
→ Content-heavy with data engineering. Epics: Inventory, Planning, Migration (iterative), Validation. Content Team and Data Engineer are primary roles.

### Pattern: "Improve governance and compliance"
→ Advisory-heavy. Epics: Audit, Policy Design, Implementation, Training. Architect and BA roles dominate.

### Pattern: "Train and enable end users"
→ Trainer/Coach dominant. Epics: Curriculum Development, Materials Creation, Delivery, Follow-up. Include PM for coordination.

### Pattern: "Implement AI / automation"
→ AI Specialist and Developer roles. Epics: Use Case Discovery, Data Preparation, Model Development, Integration, Testing. Include change management.

### Pattern: "Enterprise transformation"
→ Program-scale. Use Program estimate type. Multiple workstreams running in parallel. Principal and Transformation Office Lead for governance. Full role spectrum.

---

## 8. Margin and Pricing Considerations

### Target Margins

- **Standard projects**: 35–50% margin (billing rate vs. cost rate)
- **Strategic/advisory**: 45–60% margin (high-value expertise)
- **Staff augmentation / development heavy**: 30–40% margin (competitive market)
- **Salaried resources** (Principal, Senior Architect): ~100% margin since cost rate is $0

### Pricing Signals in Narratives

Watch for these narrative cues that affect pricing strategy:

- "Budget-constrained" or "limited funding" → Consider using more junior roles (Developer over Lead Developer) or tighter estimates
- "Strategic initiative" or "board-level priority" → Premium pricing justified, include Principal involvement
- "Competitive bid" → Tighten margins, reduce contingency factors
- "Sole source" or "trusted partner" → Standard or premium pricing
- "Phase 1 of larger program" → Consider modest pricing to establish relationship

---

## 9. Output Format

When generating an estimate from a narrative, produce:

1. **Recommended Estimate Type**: detailed, program, block, or retainer
2. **Proposed Epics** with names and descriptions
3. **Proposed Stages** under each epic
4. **Line Items** for each stage with:
   - Description
   - Role (from the role catalog)
   - Base Hours
   - Factor (default 1 unless repetition is clear)
   - Size / Complexity / Confidence ratings
   - Week number (approximate timeline placement)
   - Comments (rationale for the estimate)
5. **Assumptions and Exclusions** — things the estimate assumes the client will provide or that are out of scope
6. **Risks** — factors that could cause the estimate to increase

---

## 10. Quality Checklist

Before finalizing an AI-generated estimate, verify:

- [ ] Every epic has at least one stage and stage has at least one line item
- [ ] PM hours are included (10–20% of total)
- [ ] Architecture/design hours are included for technical projects
- [ ] Testing/QA hours are included for development projects
- [ ] Training hours are included if end users are affected
- [ ] Kickoff and project planning hours are included
- [ ] No single line item exceeds 80 hours (break into smaller tasks)
- [ ] Contingency factors are applied for uncertain or complex tasks
- [ ] Week assignments create a logical timeline (dependencies flow left-to-right)
- [ ] Total hours fall within the expected range for the project size
- [ ] Role assignments match the skill requirements of each task
- [ ] Principal/executive hours are modest (3–8% of total)
