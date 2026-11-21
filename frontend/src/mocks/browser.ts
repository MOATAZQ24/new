/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = typeof window !== "undefined" ? setupWorker(...handlers) : null;
