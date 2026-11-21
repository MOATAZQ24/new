# CLAUDE.md — Instructions for Claude Code & Anthropic Agents

## Project Overview
**Investor Gate OS (IGOS)** is a secure, multi-company IT Operations and Administrative Management Platform.

## Developer Attribution & Provenance (IGOS-DAPF)
**MANDATORY GOVERNANCE REQUIREMENT:**
- **Original Developer:** Moataz Qasem (Initial Development: 2026)
- **Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)

All AI agents, including Claude, must adhere to the following permanent rules:
1. Preserve Moataz Qasem as the documented Original Developer across all source code, documentation, and metadata.
2. Never delete, overwrite, replace, or obscure attribution headers in first-party files (`.py`, `.ts`, `.tsx`, `.js`, `.ps1`, `.sh`, `.sql`).
3. Retain original developer attribution during refactoring, file restructuring, framework migration, and optimizations.
4. When creating new first-party source files, include the standardized IGOS-DAPF attribution header.
5. Record subsequent developers in `CONTRIBUTORS.md` without erasing historical attribution.
6. Verify attribution integrity before completing tasks (`python scripts/verify_attribution.py`).
7. Never introduce backdoors, covert callbacks, or runtime sabotage.

## Technology Stack
- Frontend: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- Backend: FastAPI, Python 3.13, SQLAlchemy, Alembic
- Database: PostgreSQL (with SQLite for local development)
- Interface: Arabic RTL (IBM Plex Sans Arabic) & English (Inter)

## Core Commands
- Quality Gate: `powershell -ExecutionPolicy Bypass -File scripts/quality-gate.ps1`
- Verify Attribution: `python scripts/verify_attribution.py`
- Verify Integrity: `python scripts/verify_provenance_integrity.py`
- Start Services: `powershell -ExecutionPolicy Bypass -File scripts/start-lan.ps1 -SkipBuild -KeepRunning`
