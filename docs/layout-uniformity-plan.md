# Layout & Theme Harmonization Playbook

This living document steers the multi-phase effort to restructure the World Café web client so every screen shares a consistent layout, theme, and CSS architecture. Update it whenever a refactor task alters layouts, shared components, or styling tokens.

---

## 1. Update Protocol

To keep this playbook authoritative, perform the following steps **every time you ship a layout or theme change**:

1. **Describe the change** under the relevant section below (e.g., which screen adopted the shared shell, which tokens were added).
2. **Record dependencies** that were introduced or removed (utility classes, JavaScript hooks, design tokens).
3. **Log validation** that was run (visual diff, responsive audit, accessibility check) so future contributors know the current baseline.
4. **Note follow-up work** uncovered during the change, keeping the backlog visible.

> _If a change does not update this document, it is not considered complete._

---

## 2. Current State Assessment

- **Design tokens exist but are inconsistently consumed.** `public/design-system.css` defines the core palette, typography, spacing, and elevation scale; several legacy screens still rely on bespoke colors or inline overrides instead of the tokens.【F:public/design-system.css†L1-L120】
- **Stylesheets consolidated.** All client HTML now imports `styles.css`, which cascades `design-system.css`, `components.css`, and `layout.css`; legacy bundles (`styles-old.css`, `styles-new.css`, `styles-legacy.css`) have been removed to eliminate drift.【F:public/styles.css†L1-L120】
- **Inline overrides break the cascade.** Historic `NUCLEAR DESKTOP FIX` blocks in `index.html` have been removed, but legacy HTML still references bespoke wrappers that must migrate to layout primitives.【F:public/index.html†L1-L120】
- **JavaScript depends on class hooks.** Client logic in `public/app.js` toggles `.screen`, `.screen.active`, `.is-hidden`, and flow-specific selectors. Any structural refactor must preserve these hooks or migrate them in tandem.【F:public/app.js†L1-L120】

---

## 3. Objectives

1. **Uniform Layout Skeleton** – every top-level screen mounts inside shared responsive containers, header, and footer primitives provided by `styles.css` and `layout.css`.
2. **Theme-Driven Styling** – colors, typography, spacing, and shadows come from the design-token source of truth (`design-system.css`); raw hex values and inline styles are eliminated.
3. **Component Reuse** – shared UI pieces (cards, status badges, forms, tables) are sourced from the component library with predictable modifier classes.
4. **Robust Behavior Hooks** – JavaScript interactions (`public/app.js`) remain stable; structural hooks are preserved or migrations are documented alongside selector updates.

---

## 4. Current Layout Inventory

| Area | Current State | Gaps Identified | Owner / Notes |
|------|---------------|-----------------|---------------|
| Landing / Join Flow | Mounted on shared `app` shell and welcome primitives | Validate CTA copy hierarchy on mobile | 2024-03-17 – Rebuilt hero/join cards with `welcome-*` layout primitives |
| Table Experience | Uses bespoke flex grid and ad-hoc spacing tokens | Align to design-system spacing scale; replace hard-coded widths; migrate modal overlays | |
| Admin Dashboard | Aligned with design-system panel layout | Confirm navigation parity and badge usage with other admin screens | |
| Modal & Overlay System | Duplicate modal implementations per screen | Centralize on `ds-modal` component, enforce z-index tokens | |

> Update this table as progress is made; include links to PRs or commits for traceability.

---

## 5. Phased Execution Plan

### Phase A — Foundation Cleanup
- Consolidate CSS entry points so every HTML file imports `styles.css`, which in turn pulls `design-system.css`, `components.css`, and `layout.css`.
- Migrate inline emergency overrides into scoped component classes; remove the inline blocks after parity testing.
- Normalize global typography and spacing scales via CSS variables defined in `design-system.css`.

**Exit Criteria:** No screen ships unique `<style>` blocks or legacy stylesheet references.

### Phase B — Layout Primitives
- Define canonical layout containers (`.app`, `.screen`, `.screen-panel`, `.welcome-*`, `.content-stack`, `.toolbar`) with responsive breakpoints and spacing tokens.
- Replace page-specific wrappers with these primitives; document any exceptions required by JavaScript.
- Ensure modals, drawers, and overlays consume a shared stacking context and animation tokens.

**Exit Criteria:** All screens report usage of the shared shell and panel components in this document.

### Phase C — Component Normalization
- Catalog existing buttons, cards, tables, and form elements; map them to component-library variants with BEM-style modifiers.
- Remove duplicate declarations, creating compatibility aliases when necessary for gradual adoption.
- Provide code snippets in `docs/ui/` showcasing correct composition and states (default, hover, disabled, error).

**Exit Criteria:** Component inventory table shows 100% coverage and no conflicting class names.

### Phase D — Screen Migrations & QA
- Migrate each screen to the shared layout, recording completion in Section 6's checklist.
- Run responsive, accessibility, and real-time interaction smoke tests; document outcomes.
- Capture before/after screenshots for regressions and store references in `docs/ui/visual-diffs/`.

**Exit Criteria:** All screens are listed as migrated with QA evidence.

---

## 6. Screen Migration Checklist

Track progress with the table below. Fill in the "Status" column (Not Started / In Progress / Complete) and link to work.

| Screen / Flow | Status | Last Updated | Notes / Follow-ups |
|---------------|--------|--------------|--------------------|
| Landing Page & Join Flow | Complete | 2024-03-19 | Join wizard uses shared screen panel + tokenized cards; mobile breakpoint now stacks progress steps and CTAs; follow-up: align QR scanner overlay with wizard palette |
| Participant Lobby | Complete | 2024-03-27 | Lobby sidebar shares session context, roster, and prompt within the table shell |
| Participant Session Directory | Complete | 2024-03-21 | Session listing consumes shared panel header, accessible search meta, and responsive card grid |
| Table Interface | Complete | 2024-03-23 | Screen shell, header, and recording overlays now use design-system modals; follow-up: audit transcription stream density |
| Facilitator Controls | Complete | 2024-03-27 | Facilitator summary card surfaces status, participant counts, and actions |
| Admin Dashboard | Complete | 2024-03-16 | Wrapped in `screen-panel`; verify nav consistency |
| Admin Session List | Complete | 2024-03-23 | Session management tab rebuilt with shared stats, toolbar, and directory cards |
| Admin Settings | Complete | 2024-03-21 | Cards adopt shared form tokens; follow-up: centralize API status toast variants |
| Recording Review | Complete | 2024-03-26 | Added transcript preview modal with design-system layout, completing recording review migrations |

- **2024-03-18 – Join Session wizard**: Adopted `join-table-card` component, refreshed helper text styles, and added keyboard support for method selection. Desktop layout QA complete; mobile QR overlay theme alignment still pending.
- **2024-03-19 – Join Session wizard**: Hardened responsive behavior for mobile portrait viewports (stacked progress badges, full-width CTAs, flexible method cards). Manual audit on iPhone SE viewport; follow-up remains QR scanner overlay theming.
- **2024-03-20 – Join Session wizard**: Restored session selection change handling for the new wizard flow and repaired the session-code CTA state updates to unblock participants on all devices.
- **2024-03-20 – Table Interface overlay**: Wrapped the live transcription workspace in the shared `screen-panel` shell with tokenized header/badge styling for parity with other screens; modal theming alignment remains outstanding.
- **2024-03-21 – Participant session directory**: Rebuilt the all-sessions view with the shared panel header, search affordances, and ARIA announcements so the listing mirrors the welcome and join flows.
- **2024-03-21 – Admin settings workspace**: Converted platform configuration panes into design-system cards with shared form/toggle primitives and status badges; noted toast alignment follow-up.
- **2024-03-21 – Table interface header**: Balanced the back affordance and live-status badge inside the shared panel actions for consistent responsive behavior across devices.
- **2024-03-22 – Settings & table interface polish**: Reload settings data when switching tabs and aligned the live table header with themed status badges plus contextual session descriptions for parity across screens.
- **2024-03-22 – Harmonization status review**: Remaining migrations include participant lobby, facilitator controls, admin session list, recording review flow, and table modals/overlays.
- **2024-03-23 – Table modals & admin directory**: Replaced table recording/upload modals plus QR/manual join overlays with design-system dialogs and unified the admin session list around shared cards/toolbar patterns.
- **2024-03-24 – Recording review refresh**: Introduced shared recording list component, unified table/session badges, and documented the new responsive card patterns for future transcript integration.
- **2024-03-25 – Transcription library**: Rebuilt the all-transcriptions listing with design-system cards, accessible selection states, and responsive grouping while removing legacy inline styling; follow-up remains the transcript preview modal.
- **2024-03-26 – Recording review preview modal**: Introduced a shared transcript preview modal with metadata panels and responsive speaker breakdowns, marking the recording review flow as fully migrated.
- **2024-03-27 – Participant lobby & facilitator controls**: Added dedicated sidebar cards to the table interface for roster visibility and facilitator status summaries, including responsive styling and refreshed control notes.
- **2024-03-28 – Stylesheet & script consolidation**: Removed unused legacy bundles (`styles-old.css`, `styles-new.css`, `styles-legacy.css`, `app-old.js`, `app-enhanced.js`, `app.js.backup`) so the client references a single `styles.css`/`app.js` pair; verified layout parity across migrated screens.

---

## 7. Quality Gates & Tooling

- **Stylelint Enforcement:** Configure a Stylelint rule set to disallow raw hex values and enforce token usage (`var(--color-*)`).
- **Responsive Matrix:** Maintain a breakpoint checklist (mobile portrait, mobile landscape, tablet, desktop) for each screen migration; record completion here.
- **Accessibility Audits:** Run AXE or Lighthouse accessibility checks post-migration; log the score and issues found.
- **Visual Regression:** Capture screenshots or Percy snapshots after significant layout updates; link artifacts in this document.

---

## 8. Risk Mitigation

- Refactor incrementally with feature flags or isolated routes when possible; archive removed assets in git history instead of shipping parallel bundles.
- Document class-name changes and provide shims (temporary alias classes) so hotfixes can target both new and legacy selectors while the refactor is in flight.
- Coordinate closely with backend/socket changes to avoid breaking the DOM structure expected by listeners.

---

## 9. Communication & Coordination

- Surface blockers or cross-team dependencies in this document to keep stakeholders aligned.
- Reference this playbook in PR templates to remind contributors to update the plan before merging.
- Schedule periodic reviews (e.g., weekly) to validate that documented progress matches the implemented UI.

---

## 10. Success Criteria

- All pages import the same theme entry point (`styles.css`) with zero inline emergency overrides.
- Visual QA confirms consistent typography, spacing, and color usage across screens, including desktop and mobile breakpoints.
- Lighthouse/AXE accessibility audits meet agreed thresholds (contrast ratio, focus visibility) thanks to standardized tokens.
- CSS payload is reduced and maintainable, with obsolete style sheets removed and documentation guiding future development.

---

## 11. Glossary & Resources

- **Design Tokens:** Defined in `public/design-system.css`.
- **Component Library:** `public/components.css` and supporting modules.
- **Behavior Scripts:** `public/app.js` for DOM interactions.
- **Style Entry Point:** `public/styles.css` (imports `design-system.css`, `components.css`, and `layout.css`).

Keep this document in sync with the codebase—future contributors rely on it as the authoritative guide for layout and theme consistency.
