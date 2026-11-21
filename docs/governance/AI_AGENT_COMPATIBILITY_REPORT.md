# AI Agent Governance Compatibility Report — Investor Gate OS (IGOS)

**Document ID:** IGOS-DAPF-AIGOV-REP-001  
**Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Original Developer:** Moataz Qasem (2026)  
**Audit Date:** 2026-11-21  

---

## 1. Supported AI Agent Ecosystem Matrix

| Agent / Environment | Configuration Target | Integration Format | Compatibility Status |
| :--- | :--- | :--- | :--- |
| **Google Antigravity** | `AGENTS.md` | Markdown Instructions & Workspace Rules | **Fully Supported & Active** |
| **Anthropic Claude Code** | `CLAUDE.md` | Direct Root Markdown Configuration | **Fully Supported** |
| **Gemini CLI / Google AI** | `GEMINI.md` | Workspace Context Instructions | **Fully Supported** |
| **Universal Coding Agents** | `.agents/rules/developer-attribution.md` | Agent Rule Specifications | **Fully Supported** |
| **Cursor IDE** | `.cursor/rules/developer-attribution.mdc` | MDC Rule format with `alwaysApply: true` | **Fully Supported** |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Copilot Repository Instructions | **Fully Supported** |
| **Machine-Readable Standard**| `docs/governance/ai_agent_policy.json` | JSON Schema Specification | **Fully Supported** |

---

## 2. Policy Transmission & Subagent Inheritance
- **Coordinator to Subagents:** When Antigravity or other agent systems spawn subagents, the primary system prompt and workspace rules (`AGENTS.md`) are automatically inherited.
- **Verification Hook:** Pre-completion validation scripts (`python scripts/verify_attribution.py`) ensure that any code changes produced by subagents or parallel agents are verified before task finalization.

---

## 3. Limitations & Human Authorization Boundaries
1. AI instructions provide **behavioral governance**; they ensure well-behaved AI agents respect and preserve attribution during normal operation.
2. For protection against intentional unauthorized human tampering or misconfigured bots, **technical enforcement** (CI/CD GitHub Actions, Git pre-commit hooks, and protected metadata hashes) is implemented under Prompt 3.
