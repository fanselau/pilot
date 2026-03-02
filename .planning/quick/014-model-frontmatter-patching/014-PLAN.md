# Quick Task 014 Plan

## Description
Model Frontmatter Patching

## Tasks
1. Add a core model resolution module that maps agent + profile + provider mode to concrete model IDs.
2. Add frontmatter patching logic to update `.opencode/agents/*.md` `model:` fields before subagent spawns.
3. Integrate patching into the runner launch flow and add tests for model resolution and frontmatter patching behavior.
