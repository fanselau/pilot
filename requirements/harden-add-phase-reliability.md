# Harden add-phase Reliability

## Problem
`add-phase` frequently misinterprets requirements. Instead of reading the requirement file and creating a phase with the correct title/description, it sometimes:
1. Picks up fragments of its own GSD workflow instructions as the phase title
2. Creates duplicate phases with titles that already exist
3. Creates phases with nonsensical slugified names from instruction text

Example: Given `requirements/fix-premature-completion-detection.md`, it created phase 29 titled "Add a new integer phase to the end of the current milestone in the roadmap" — which is a line from the GSD workflow template, not the requirement.

This makes `phase` and `milestone` scopes unreliable compared to `quick`, which works consistently because it skips `add-phase` entirely.

## Goal
`add-phase` should be as reliable as `quick` — read the requirement, create a correctly-titled phase, every time. Phase and milestone scopes should "just work" with the same reliability as quick mode.

## Requirements

### Must Have
- [ ] `add-phase` must extract the phase title from the requirement file's `# Title` heading (first H1), NOT from GSD instructions or workflow templates
- [ ] If the requirement file has a `# Title` heading, use it verbatim as the phase title
- [ ] If no H1 heading found, use the filename (sans extension, dashes→spaces, title-cased) as fallback
- [ ] The requirement file path must be passed to the GSD agent in a way that clearly separates it from instruction text (e.g., explicit `<requirement_file>` tags or similar)
- [ ] Add a guard: before committing a new phase, verify the phase title does NOT match any existing phase title in ROADMAP.md (prevent duplicates)
- [ ] Add a guard: the phase title must NOT contain GSD instruction fragments (e.g., "add a new integer phase", "execute all plans", "spawn subagents") — reject and retry if it does

### Nice to Have
- [ ] Delegate.ts already has `extractRequirementTitle()` — use it to pre-extract the title and pass it explicitly to `add-phase` instead of relying on the GSD agent to parse it
- [ ] Log the extracted title before spawning: "Creating phase: {title} from {requirement_path}"
- [ ] If `add-phase` creates a phase with a title that doesn't match the pre-extracted title (fuzzy match), log a warning

## Technical Notes
- `delegate.ts` already has `extractRequirementTitle(requirementPath)` that reads the H1 heading
- The title is already passed to `add-phase` via `addArgs` in the fallback delegation path
- The problem may be in the GSD `gsd-add-phase.md` agent prompt — it might not clearly separate "instruction to add a phase" from "content of the requirement"
- Check `.opencode/command/gsd-add-phase.md` for how the requirement is injected
- The `plan-phase` step already uses `@filePath` syntax to reference the requirement — `add-phase` should use the same pattern

## Do NOT
- Remove `add-phase` — it serves a purpose (creating phase structure in .planning/)
- Make `phase` scope bypass `add-phase` and go straight to `execute-phase` — that only works when plans already exist
- Add complex NLP to detect instruction fragments — a simple blocklist of known GSD instruction phrases is sufficient
