# SCDP - Synozur Consulting Delivery Platform

## Overview

SCDP is a comprehensive consulting delivery platform designed to manage the entire lifecycle of consulting projects. It streamlines operations from estimation to billing, encompassing time tracking, expense management, and resource allocation. The platform supports role-based access control for various user types (admins, project managers, employees, executives) and aims to automate invoice generation and manage rate structures. SCDP's core purpose is to enhance efficiency and provide robust management capabilities for consulting businesses.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **UI**: Radix UI components with shadcn/ui design system, styled using Tailwind CSS.
- **Routing**: Wouter.
- **State Management**: TanStack Query for server state.
- **Form Handling**: React Hook Form with Zod validation.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **API**: RESTful API.
- **ORM**: Drizzle ORM.
- **Validation**: Zod schemas (shared with client).
- **Authentication**: Azure AD SSO.

### Database
- **Type**: PostgreSQL (Neon Database for hosting).
- **Schema Management**: Drizzle Kit.
- **Key Entities**: Users (role-based), Clients, Projects, Estimates (epics, stages, activities, allocations), Time entries, Expenses, Invoices, Rate overrides, Pending receipts.

### Project Structure
- **Monorepo**: `/client` (React), `/server` (Express), `/shared` (common types/schemas).

### Authentication & Authorization
- **SSO**: Azure AD (Microsoft Entra ID) integration.
- **Roles**: Five-tier hierarchy (admin, billing-admin, pm, employee, executive) with feature-based permissions.

### Data Flow
- **API Layer**: Express routes with auth/validation middleware.
- **Storage Layer**: Abstracted database operations.
- **Query Management**: TanStack Query for caching and synchronization.
- **Validation**: Client-side Zod mirroring server schemas.

### Document Storage
- **Current**: Local file storage for expense receipts and metadata, expandable for invoices, SOWs, and change orders.
- **Deprioritized**: SharePoint Embedded infrastructure exists but is not actively used.

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React (icons), Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form, Date-fns.
- **Build & Runtime**: ESBuild, PostCSS, WS (WebSockets for Neon).