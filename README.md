# Constellation — Synozur Consulting Delivery Platform (SCDP)

Constellation is a comprehensive consulting delivery platform that manages the full project lifecycle — from estimation and resource planning through time tracking, expense management, and automated invoice generation. It is built as a **deeply integrated Microsoft 365 application**, with Microsoft services woven into every layer of the platform.

---

## Why Constellation Is a Highly Integrated Microsoft 365 Application

Constellation is fundamentally built on the Microsoft 365 ecosystem, using the Microsoft identity platform as its backbone for authentication and data access across every tenant. All user authentication flows through **Microsoft Entra ID (Azure AD)** via MSAL-based OAuth 2.0 and OpenID Connect, supporting multi-tenant app registrations so that each client organization can grant admin consent and access Constellation under their own corporate identity. The entire backend infrastructure is hosted on **Microsoft Azure**, and the platform leverages **Azure AI Foundry** and **Azure OpenAI** for AI-powered features — including AI-generated project estimates, invoice narratives, status reports, Sub-SOW documents, and changelog summaries. Every document and file attachment is stored in **SharePoint Embedded (SPE)**, Microsoft's newest embedded file storage capability, which gives each tenant an isolated, Microsoft-managed container accessible through the **Microsoft Graph API**. This means Constellation's document management layer is natively compliant with Microsoft 365 data governance, retention, and security policies, without any separate storage infrastructure.

The platform extends into the heart of Microsoft 365 productivity tools through deep, bidirectional integrations with **Microsoft Planner** and **Microsoft Teams**. Project assignments created in Constellation are automatically synchronized with Microsoft Planner tasks — including bucket management, assignment tracking, and due dates — giving project teams a native Planner view of their work without leaving their Microsoft 365 environment. The sync runs on a scheduled background service and supports conflict resolution in both directions, so changes made directly in Planner are reflected back in Constellation in near real-time. For email and calendar workflows, Constellation uses **Microsoft Graph API** to send notifications through **Outlook**, covering expense approval updates, time entry reminders, and project milestone alerts. The platform is also designed to auto-provision **Microsoft Teams** workspaces aligned to client and project hierarchies, so each project gets a dedicated Team and channel structure that mirrors the Constellation project model — bridging task management, communication, and document collaboration into a single cohesive experience.

Constellation is also a first-class **Microsoft 365 Copilot** application, exposing a full Model Context Protocol (MCP) API surface that connects directly to **Copilot Studio** via a Power Platform custom connector. This MCP layer provides Microsoft 365 Copilot with read access to the complete Constellation data model — including user assignments, time entries, expenses, project status, deliverables, RAIDD logs, financial aggregates, and CRM deal data — so that users can query and summarize their consulting work through natural language directly in Teams, Outlook, or the M365 Copilot chat experience. Authentication for the Copilot integration uses OAuth bearer tokens validated against Entra app registrations via JWKS, ensuring the same tenant-scoped security model applies whether users access Constellation through its own UI or through a Copilot prompt. Together, these integrations make Constellation not just a platform that connects to Microsoft 365, but one that lives inside it — surfacing project intelligence, automating document workflows, and enabling AI-assisted delivery management entirely within the tools that consulting teams already use every day.

---

## Key Microsoft 365 Integrations at a Glance

| Service | Integration |
|---|---|
| **Microsoft Entra ID (Azure AD)** | Multi-tenant SSO, OAuth 2.0 / OIDC, admin consent, app-only certificate auth |
| **Microsoft Azure** | Full backend hosting (compute, API, database, AI services) |
| **Azure AI Foundry / Azure OpenAI** | AI-generated estimates, narratives, status reports, and changelogs |
| **SharePoint Embedded (SPE)** | Primary document storage via isolated per-tenant containers and Microsoft Graph |
| **Microsoft Graph API** | Universal integration layer for all M365 services (files, mail, Planner, identity) |
| **Microsoft Planner** | Bidirectional task sync — Constellation assignments ↔ Planner tasks and buckets |
| **Microsoft Teams** | Auto-provisioned workspaces aligned to client/project hierarchy |
| **Outlook / Microsoft 365 Mail** | Email notifications for approvals, reminders, and milestones via Graph API |
| **Microsoft 365 Copilot** | MCP connector exposing full project data to Copilot Studio agents in Teams and M365 |
| **Copilot Studio** | Custom agent wired to Constellation MCP endpoints via Power Platform connector |

---

## Architecture Overview

- **Frontend**: React 18 + TypeScript (Vite), Radix UI / shadcn/ui, Tailwind CSS
- **Backend**: Node.js + Express.js (TypeScript), hosted on Microsoft Azure
- **Database**: PostgreSQL via Neon, managed with Drizzle ORM
- **Authentication**: Microsoft Entra ID (MSAL Node) — multi-tenant, production SSO
- **Document Storage**: SharePoint Embedded (primary), Replit Object Storage (legacy fallback)
- **AI**: Azure AI Foundry, Azure OpenAI, Replit AI (configurable per tenant)
- **Email**: Microsoft Graph API (Outlook) with SendGrid fallback

## Documentation

| Document | Description |
|---|---|
| [`docs/MCP_README.md`](docs/MCP_README.md) | MCP endpoint reference for Copilot integration |
| [`docs/MCP_CONNECTOR_SETUP.md`](docs/MCP_CONNECTOR_SETUP.md) | Step-by-step Copilot Studio connector setup |
| [`AZURE_APP_PERMISSIONS_SETUP.md`](AZURE_APP_PERMISSIONS_SETUP.md) | Azure AD app permissions checklist |
| [`SHAREPOINT_PERMISSIONS_SETUP.md`](SHAREPOINT_PERMISSIONS_SETUP.md) | SharePoint Embedded container setup |
| [`docs/azure-sharepoint-setup.md`](docs/azure-sharepoint-setup.md) | Full SPE setup guide |
| [`docs/design/microsoft-365-project-integration.md`](docs/design/microsoft-365-project-integration.md) | M365 Planner & Teams integration design |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | End-user guide |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Version history |
