# SCDP Product Backlog

## 🤖 AI & Copilot Features

### AI Chat Interface
- [ ] Add AI chat database schema (aiChatSessions, aiChatMessages, aiActionProposals, aiToolRuns)
- [ ] Integrate Azure OpenAI (GPT-5) or Claude Sonnet on Azure
- [ ] Build chat API endpoints with SSE streaming for real-time responses
- [ ] Create contextual chat UI component embedded in key pages
- [ ] Implement human-in-the-loop approval workflow for AI actions

### MCP Server for Agentic AI
- [ ] Build MCP server exposing SCDP resources (projects, estimates, time, expenses, invoices)
- [ ] Implement MCP tools with RBAC enforcement:
  - `create_time_entry()` - AI-assisted time entry
  - `create_expense_from_receipt()` - OCR + auto-categorize expenses
  - `draft_invoice()` - Intelligent invoice generation
  - `generate_estimate_from_prompt()` - Natural language estimate creation
  - `summarize_variance()` - Project performance analysis
- [ ] Add audit logging for all AI interactions and tool executions
- [ ] Implement action proposal system (propose → approve → commit)

### AI-Enhanced Workflows
- [ ] **Estimates**: "Draft estimate from brief," "Refine by margin targets," "Explain deltas"
- [ ] **Time Entry**: "Propose week entries," "Fix missing rates," "Summarize unbilled"
- [ ] **Expenses**: Receipt photo OCR, auto-categorization, policy violation detection
- [ ] **Invoicing**: Period-based draft generation, variance explanation
- [ ] **Reporting**: "Why did margin drop?" "What-if pricing scenarios"

---

## 📊 SharePoint Embedded (SPE) Features

### Infrastructure (Defined but Unused)
- [ ] Container management UI (6 tables exist: containerTypes, clientContainers, containerPermissions, containerColumns, metadataTemplates, documentMetadata)
- [ ] Document metadata templates UI
- [ ] Custom column configuration for different document types
- [ ] Permission management interface
- [ ] Container provisioning workflow
- [ ] Document search and filtering using metadata

---

## 📈 Estimate & Project Management

### Estimate Hierarchy & Workflow
- [ ] Epic → Stage → Activity UI implementation (schema exists, no frontend)
- [ ] Weekly staffing allocations UI (estimateAllocations table exists)
- [ ] Estimate payment milestones management
- [ ] Vocabulary customization UI (epicLabel/stageLabel/activityLabel system exists but unused)

### Rate Management
- [ ] User rate schedules UI (userRateSchedules table exists)
- [ ] Project-specific rate overrides UI (projectRateOverrides table exists)
- [ ] Rate history and effective date management

---

## 💰 Financial & Billing

### Dashboard Enhancements
- [ ] Calculate burn rate from time entries
- [ ] Add burnedAmount and burnPercentage to project cards
- [ ] Real-time budget consumption tracking

### Batch & Invoice Management
- [ ] Batch detail CSV export generation
- [ ] Batch detail PDF generation
- [ ] Financial reports page routing and menu integration (page exists but not accessible)

---

## 📄 Document Management

### Upload Capabilities
- [ ] MSA (Master Service Agreement) upload and storage
- [ ] NDA (Non-Disclosure Agreement) upload and storage
- [ ] SOW (Statement of Work) upload and storage
- [ ] Document versioning and approval workflow
- [ ] Integration with SharePoint Embedded for enterprise document storage

---

## 🔧 System Enhancements

### Multi-Tenant & Vocabulary
- [ ] Vocabulary customization across all UI (use existing epicLabel/stageLabel/activityLabel fields)
- [ ] Tenant-specific terminology preferences
- [ ] Custom field labels per client or organization

---

**Last Updated**: October 2025  
**Total Features**: 40+ backlog items across 6 major categories
