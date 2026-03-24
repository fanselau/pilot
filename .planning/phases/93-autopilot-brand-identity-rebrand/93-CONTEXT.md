# Phase 93: AutoPilot Brand Identity Rebrand - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/autopilot-brand-identity-rebrand.md)

<domain>
## Phase Boundary

Rebrand the Pilot frontend to **AutoPilot** with a cohesive visual identity that communicates automation, motion, intelligence, and confidence. This covers the web app only — renaming visible UI branding, creating SVG-based brand assets, updating favicon/app icons, and ensuring light/dark theme compatibility.

</domain>

<decisions>
## Implementation Decisions

### Brand Name
- Rename all user-facing product references from "Pilot" to "AutoPilot" (app title, header brand text, browser title, and other top-level user-facing brand labels in the web UI)

### Brand Identity Direction
- The identity must feel related to automatic execution / autonomous flow / guided motion
- NOT aviation cosplay, NOT toyish, NOT a cheesy airplane logo
- Technical, sharp, minimal, premium, believable for an autonomous dev pipeline
- Do not do a gimmicky pilot/airplane mascot treatment
- Do not replace the product voice with something playful or childish

### SVG Brand Assets
- Introduce a new brand mark / logotype direction suitable for the app shell and browser/tab identity
- Add a clean, production-ready SVG-based brand asset approach for the web app (no raster-only placeholder branding)
- Add/update favicon/app icon assets so the browser identity also reflects AutoPilot
- Use the newly installed icon/branding skills if available in the project environment (.agents/skills/svg-logo-designer, .agents/skills/logo-design-guide, .agents/skills/favicon-gen)

### Theme Compatibility
- Branding must work in both light and dark themes
- Keep the UI readable and structurally familiar; this is a rebrand, not a full layout redesign

### Nice to Have (agent discretion)
- Introduce subtle accent color refinements in the design token layer if they materially strengthen the brand
- Add a small reusable brand component for the header / future marketing surfaces
- If appropriate, add a short internal note describing the design rationale and asset decisions

### Agent's Discretion
- Specific SVG design (shape, paths, visual metaphor) — must be technical/sharp/minimal
- Exact accent color values if introducing refinements
- File organization for brand assets (suggest: web/src/assets/brand/)
- Whether to create a reusable Brand component vs inline SVG
- Monochrome/color variants for different contexts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Skills (Brand/Logo/Favicon)
- `.agents/skills/svg-logo-designer/SKILL.md` — SVG logo generation workflow and patterns
- `.agents/skills/logo-design-guide/SKILL.md` — Logo design principles, AI generation, scalability rules
- `.agents/skills/favicon-gen/SKILL.md` — Favicon generation workflow (SVG, ICO, apple-touch, manifest)

### Current Branding Surfaces
- `web/src/routes/__root.tsx` — Current header brand text ("Pilot") + page title ("Pilot Dashboard")
- `web/src/styles.css` — Design token layer (CSS custom properties for theming)
- `web/package.json` — Package name "pilot-web"

### Requirements
- `requirements/autopilot-brand-identity-rebrand.md` — Full PRD with acceptance criteria

</canonical_refs>

<specifics>
## Specific Ideas

- The brand mark should evoke "autonomous flow" or "guided motion" — think abstract circuit/flow path, not an airplane
- SVG approach: create SVGs that work at favicon size (16px) and app header size
- Assets needed: full logo (icon + wordmark), icon-only, favicon set (SVG + ICO + apple-touch-icon)
- The header currently shows just plain text "Pilot" — replace with icon + "AutoPilot" wordmark
- Browser tab currently says "Pilot Dashboard" — update to "AutoPilot"

</specifics>

<deferred>
## Deferred Ideas

None — PRD covers phase scope

</deferred>

---

*Phase: 93-autopilot-brand-identity-rebrand*
*Context gathered: 2026-03-24 via PRD Express Path*
