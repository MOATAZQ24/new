# Investor Gate OS Design System (IGDS) — Specification & UX Architecture

```text
==============================================================================
Investor Gate OS (IGOS) - Technical Operations Platform
Original Developer: Moataz Qasem (2026)
Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
==============================================================================
```

## 1. Executive Summary & Design Philosophy
The **Investor Gate OS Design System (IGDS)** establishes a unified, accessible, and fast design language for enterprise IT operations across both desktop workstations and mobile clients. Inspired by Apple's interaction fidelity, Google's material density, Linear's keyboard-centric productivity, and Saudi National Design System guidelines, IGDS eliminates visual clutter and ensures operations can be executed with zero training.

---

## 2. Color Palette & Semantic Tokens

### Light Mode (Default)
| Semantic Token | Hex Value | Role & Usage |
| :--- | :--- | :--- |
| **Canvas Background** | `#F7F8FA` | Low-strain neutral gray page canvas |
| **Surface / Card** | `#FFFFFF` | Primary content panels, tables, cards, dialogs |
| **Subtle Border** | `#E2E8E5` | Structural dividers, input outlines, table rows |
| **Brand Primary** | `#078363` | Authoritative primary actions, focused accents, badges |
| **Primary Text** | `#202124` | Headers, labels, high-contrast readable text |
| **Secondary Text** | `#64748B` | Supporting descriptions, metadata, timestamps |
| **Interactive Accent** | `#4285F4` | Active tabs, focus rings, link highlights |
| **Operational Warning** | `#D97706` | Approvals pending, moderate SLA warning |

### Dark Mode Semantic Tokens
| Semantic Token | Hex Value | Role & Usage |
| :--- | :--- | :--- |
| **Canvas Background** | `#0F172A` | Deep slate night canvas |
| **Surface / Card** | `#1E293B` | High-contrast elevated panels |
| **Subtle Border** | `#334155` | Night border dividers |
| **Brand Primary** | `#10B981` | Emerald vibrancy for dark backgrounds |
| **Primary Text** | `#F8FAFC` | Bright crisp Arabic & English typography |
| **Secondary Text** | `#94A3B8` | Subdued secondary descriptors |

---

## 3. Typography & Spacing
- **Arabic Font Family:** `IBM Plex Sans Arabic`, `Cairo`, `sans-serif`
- **English / Numbers Font Family:** `Inter`, `Roboto`, `monospace` (for code references and timestamps)
- **Density Hierarchy:**
  - `Compact`: High information density for technical technicians handling 50+ tasks/tickets.
  - `Comfortable`: Default view balancing breathing room with direct data access.
  - `Spacious`: Executive dashboard and presentation modes.

---

## 4. Advanced Interaction Primitives
1. **`MasterDetailLayout`:**
   - Solves the long-list scrolling problem permanently.
   - Dual independent scroll flexbox containers: Left master table/cards scroll naturally; right detail drawer remains pinned in the viewport with its own independent scroll container.
   - Clicking row 50 or 100 immediately updates the right-hand panel in place without scrolling the window.
2. **`Tooltip`:**
   - Directional (`top`, `bottom`, `left`, `right`), collision-aware tooltip with caret indicator, keyboard focus triggers, and micro-animations.
3. **`HoverCard`:**
   - Intent-aware rich preview card with a 150ms graceful dismissal buffer, allowing pointer traversal into the popover content.
4. **`Popover`:**
   - Accessible floating container with outside-click detection and Escape key dismissal.
5. **`RelativeScheduler`:**
   - Instant relative scheduling presets (`+30m`, `+1h`, `+2h`, `+4h`, `نهاية اليوم`, `صباح الغد`, `الأسبوع القادم`) combined with absolute date-time selection.
6. **`StickyActionBar`:**
   - Floating action bar animating into view when multiple items are selected in lists, enabling batch operations (reassign, delete, approve).
7. **`InlineEdit`:**
   - Fast in-place field editing with immediate validation and keyboard hotkeys (`Enter` to save, `Esc` to cancel).

---

## 5. Iconography Governance & Complete Emoji Removal
- **Zero Application-Generated Emojis:** All UI components, badges, forms, and dialogs use SVG icons from `lucide-react`.
- **Preserved Boundary:** Emojis are strictly permitted only inside outbound Telegram notification message bodies, where mobile messaging standards recommend expressive notification headers.

---

## 6. Operational Task Management Reconstruction
- **Unified 4-Way View Switcher:**
  1. **List View:** Dense operational table with keyboard navigation, inline priority indicators, and `MasterDetailLayout`.
  2. **Kanban Board:** 4-stage Kanban (`Assigned`, `In Progress`, `Blocked`, `Completed`) with rapid status shifters.
  3. **Calendar View:** Monthly scheduling grid plotting task deadlines by day.
  4. **Analytics View:** Operational throughput, completion metrics, and priority distributions.
- **Voice Task Integration:** WhatsApp-style audio task recording (`VoiceTaskRecorder`) with direct playback and waveform duration indicators.

---

## 7. Help Desk Reconstruction
- **3-Stage Adaptive Stepper (`AdaptiveTicketWizard`):**
  - **Stage 1 (Category Selection):** 6 curated categories (`Hardware`, `Software`, `Network`, `Access`, `Email`, `General`) with visual cues and optional quick service templates.
  - **Stage 2 (Problem Details & Multimedia):** Title, detailed description, priority level, requester, related technical asset, and voice note recorder.
  - **Stage 3 (Review & Confirmation):** Comprehensive summary card with draft recovery notification and instant submission.
- **Auto-Saved Draft Protection:** Form progress is continuously persisted in `localStorage` (`igos_service_desk_wizard_draft`) to prevent loss on inadvertent tab closure or network disconnection.
- **Streamlined Scope:** Excludes unnecessary ITIL administrative widgets, focusing on prompt employee problem resolution.
- **Technician Queue:** Quick queue sub-tabs (`جميع التذاكر`, `تذاكري المعينة`, `قيد المعالجة`, `تم الحل / مغلقة`) with rapid ticket-to-task conversion.

---

## 8. Mobile Native-Like Experience
- Responsive mobile card layouts at `320px`, `360px`, `390px`, and `430px`.
- Dedicated bottom navigation (`MobileTabBar`) with safe-area insets.
- Native-like bottom sheets for filtering (`MobileFilterSheet`) replacing cramped desktop selects.
