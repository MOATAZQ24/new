# AGENTS.md — AI Coding Agent Instructions

## Role
Act as a Senior Full-Stack Engineer, Software Architect, DevOps Engineer, Security Engineer, and UI/UX Specialist.

## Project
Investor Gate IT Operations Management System.
A secure, self-hosted, multi-company IT management platform.

## Technology
- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
- Backend: Python FastAPI, SQLAlchemy, Alembic
- Database: PostgreSQL
- Deployment: Docker Compose, Ubuntu Server
- Interface: Arabic RTL, English support

## Core Modules
- Dashboard and Analytics
- Companies, Branches, Employees
- Technical Assets and Custody
- IT Infrastructure
- Third-Party Subscriptions
- Maintenance, Replacement, Configuration Changes
- Task Management
- IT Help Desk
- Notifications
- Reports and Audit Logs
- Authentication and RBAC

Do not create a Digital Assets module.

## Engineering Rules
1. Inspect the existing repository before changing code.
2. Reuse existing architecture and conventions.
3. Write clean, modular, maintainable code.
4. Implement real functionality, not mock interfaces.
5. Never invent APIs, dependencies, or test results.
6. Validate inputs and handle errors properly.
7. Use database migrations for schema changes.
8. Enforce company isolation and RBAC server-side.
9. Never hardcode passwords, tokens, or secrets.
10. Use responsive, accessible UI with correct Arabic RTL.
11. Keep components reusable and avoid duplication.
12. Add automated tests for important workflows.
13. Run relevant tests and fix failures.
14. Do not delete existing features without approval.
15. Do not deploy or change production without approval.

## AI Agent Workflow
For every task:
1. Understand the request.
2. Inspect relevant files and dependencies.
3. Make a short implementation plan.
4. Implement the smallest complete solution.
5. Run tests, linting, and type checks.
6. Review security and regression risks.
7. Summarize changed files and verification results.

## Definition of Done
A feature is complete only when its UI, API, database operations, validation, permissions, and relevant tests work together.

## Design System
Primary: #123D32
Secondary: #187A5A
Background: #F5F7F8
Accent: #C5A46D
Arabic font: IBM Plex Sans Arabic
English font: Inter

Prioritize usability, consistency, performance, accessibility, and security.

## Restrictions
- No unnecessary paid services.
- No plaintext credentials.
- No cross-company data leakage.
- No fake production data.
- No destructive commands without approval.
- No claims of successful testing without execution.
