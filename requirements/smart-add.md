# Smart Add — Intelligent Task Routing

## Problem

Currently adding work to the pipeline requires knowing GSD internals:
- `build-full` vs `add-and-build` vs `run-command`
- Whether to create a milestone, add a phase, or run a quick task
- Whether the project needs `init`, `setup`, or is ready to go
- How to format queue entries

This is error-prone. Even Gorb (the AI CTO) gets it wrong — using `build-full` on existing projects, `add-and-build` without descriptions, wrong modes causing phantom completions. If an AI agent can't get it right, the interface is wrong.

## Goal

One command: `pilot add <project> <requirements-file-or-description>`. Pilot figures out everything else.

## The Interface

```bash
# Point at a requirements file — pilot handles the rest
pilot add resume-roast requirements/landing-page-redesign.md

# Or just describe what you want
pilot add resume-roast "add dark mode toggle to settings page"

# Multiple requirements = milestone
pilot add resume-roast requirements/v2-redesign/

# New project? Pilot handles init + setup
pilot add my-new-tool requirements/my-new-tool.md
```

That's it. No modes. No GSD vocabulary. Just "project + what to build."

## Requirements

### Must Have — Scope Detection

Pilot reads the requirement and determines the right scope:

- [ ] **Milestone** (multi-phase, weeks of work):
  - Requirements file has multiple `## Phase` or `## Must Have` sections with 10+ items
  - Or a directory of requirement files is passed
  - → Creates a new milestone in ROADMAP, plans all phases
  
- [ ] **Phase** (single feature, hours-days):
  - Requirements file has a focused `## Requirements` section with 3-10 items
  - Project already has a milestone → adds as next phase
  - → Adds phase to current milestone, plans + executes
  
- [ ] **Quick task** (small fix, minutes):
  - Input is a short string description (no file), or file has <3 items
  - → Runs `quick` command directly, no phase/milestone overhead

- [ ] Log the decision: "Detected: phase-level task (7 requirements). Adding as Phase 5 to milestone launch-v1."

### Must Have — Project State Detection

- [ ] **No project directory** → Error: "Project 'x' not found in /home/user/dev/"
- [ ] **No `.opencode/`** → Auto-run `pilot setup` first, then continue
- [ ] **No `.planning/`** → Fresh project. Run `init` (creates planning structure), then add work
- [ ] **`.planning/` exists, phases incomplete** → Resume: continue building from current phase, THEN add new work after
- [ ] **`.planning/` exists, all phases done** → Ready for new work: add phase or milestone
- [ ] **Already queued** → Warn: "resume-roast already queued (build-full). Add anyway? [Y/n]" (auto-yes in non-interactive mode)
- [ ] **Currently running** → Warn: "resume-roast is currently running (Phase 2 execute). Queuing after completion."

### Must Have — Requirements Handling

- [ ] If requirements file path given → validate it exists, copy/symlink to project's `requirements/` dir if not already there
- [ ] If string description given → generate a minimal requirements file from the description:
  ```markdown
  # <Title from description>
  
  ## Problem
  <extracted from description>
  
  ## Requirements
  ### Must Have
  - [ ] <parsed from description>
  
  ## Do NOT
  - Break existing functionality
  ```
- [ ] If directory of requirements given → treat as milestone, each file = potential phase

### Must Have — Queue Integration

- [ ] Adds to `~/.pilot/queue.json` (from queue-storage-migration requirement)
- [ ] Sets correct internal mode based on scope detection (user never sees this)
- [ ] `pilot add --dry-run` shows what would happen without doing it
- [ ] Returns the queue item ID for reference

### Nice to Have

- [ ] `pilot add <project> --from-issue <github-url>` — fetch GitHub issue and generate requirements
- [ ] `pilot add <project> --interactive` — asks clarifying questions to refine scope
- [ ] Scope override: `pilot add <project> req.md --as quick|phase|milestone` for when auto-detection is wrong
- [ ] `pilot add` with no args → shows recent projects and prompts for selection
- [ ] Dependency detection: if requirements reference another project, auto-add `dependsOn`

## Examples

```bash
# Big redesign with multiple requirement files
$ pilot add resume-roast requirements/v2/
→ Detected: milestone (4 requirement files, 23 total items)
→ Creating milestone "v2" with 4 phases
→ Queued: resume-roast | milestone-v2 | 4 phases
→ Run `pilot run` to start building

# Single feature
$ pilot add resume-roast requirements/dark-mode.md
→ Detected: phase (8 requirements)  
→ Project has milestone launch-v1 (3/3 phases done)
→ Adding as Phase 4: "Dark Mode"
→ Queued: resume-roast | phase-4-dark-mode

# Quick fix
$ pilot add resume-roast "fix the favicon 404 on /roast page"
→ Detected: quick task (single fix)
→ Queued: resume-roast | quick | fix favicon 404

# New project
$ pilot add my-new-saas requirements/my-new-saas.md
→ Project 'my-new-saas' not found. Creating...
→ Running pilot setup my-new-saas
→ Running pilot init my-new-saas
→ Detected: milestone (12 requirements, 3 phases)
→ Queued: my-new-saas | build-full
```

## Technical Notes

- Scope detection can be simple heuristic for v1: count requirement items, check for phase headers, measure file size
- No LLM needed for scope detection — pattern matching on markdown structure
- The generated requirements file from string descriptions should be minimal but valid for GSD agents to work with
- `pilot build <project> <req>` = `pilot add` + `pilot run` (convenience)

## Do NOT
- Expose GSD modes (build-full, add-and-build, run-command) to the user
- Require the user to know about milestones vs phases vs quick tasks
- Auto-run without queuing — always queue first, `pilot run` starts execution
- Over-engineer scope detection — simple heuristics that can be overridden is better than complex ML
