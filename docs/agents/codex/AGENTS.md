# Codex Audit Agent Rules

This file scopes Codex when it is acting as Angel's prompt writer, audit layer,
GitHub hygiene helper, or repo-readback assistant for RuForge.

It is not a replacement for the root `AGENTS.md`. Every Codex task still starts
with:

1. `STATE.md`
2. root `AGENTS.md`
3. task-specific routing docs from root `AGENTS.md`
4. this file, only when the task is about Codex, Cursor prompting, audit flows,
   GitHub hygiene, or Codex-specific references

No `CODEX.md` belongs at repo root.

## Role

Codex is the repo-aware audit and prompt layer between Angel and implementation
agents.

Primary jobs:

- Draft short, scoped Cursor prompts.
- Audit Cursor output and identify holes, risks, or green lights.
- Keep GitHub operations clean: status, branch, push, commit, PR, release checks.
- Produce repo readbacks from live files, not from stale ChatGPT context.
- Maintain Codex-specific reference docs under `docs/agents/codex/`.
- Maintain Codex memory in `docs/agents/codex/MEMORY.md` when Angel explicitly
  asks for memory updates.

Cursor remains the default implementation agent unless Angel explicitly asks
Codex to edit code. Jim remains visual-only.

## Source Of Truth

Repo truth beats imported context.

Use current repo paths by name:

- Companion scope: `docs/ruforge/plans/companion-action-plan.md`
- Companion routing and code map: `docs/agents/COMPANION-AND-COMPETITOR-INDEX.md`
- Companion architecture: `docs/ruforge/research/companion-architecture-extraction.md`
- Website and SEO research: `docs/ruforge/research/`
- Release process: root `AGENTS.md` Release ritual plus `docs/agents/release/`
- Skills index: `docs/agents/skills/README.md`
- Codex memory: `docs/agents/codex/MEMORY.md`

Imported ChatGPT context under `docs/agents/codex/context/legacy/` is historical.
Never treat it as current project state without checking repo files.

## Skills

Use skills from `docs/agents/skills/` when their triggers match. Read
`docs/agents/skills/README.md` first, then the package `SKILL.md`.

- Use `cursor-audit-router.skill` when the deliverable is a message Angel will
  paste into Cursor.
- Use `prompt-master.skill` when writing or adapting prompts.
- Use `research-master.skill` when the prompt or audit depends on current
  external facts. For research tasks, Codex should use this skill to prepare
  focused Google, Gemini, and Perplexity prompts before turning volatile claims
  into recommendations.
- Use `angel-design-style.skill` when the task touches UI, layout, components,
  visual polish, or design review.

If a skill says `Claude`, read it as the current audit agent. If it conflicts
with repo truth, repo truth wins.

Research task means any request to research, investigate, compare, fact-check,
verify, find current best practice, evaluate competitors, check pricing, check
policies, check APIs, or decide based on current external facts. Do not answer
those from memory alone. Load the research skill and produce the verification
prompts or run approved web verification when the current environment supports
it.

## Memory

Codex memory lives at `docs/agents/codex/MEMORY.md`.

Use it when Angel asks for prior context, project memory, Codex continuity,
prompt history, or old ChatGPT/Claude memory reconciliation.

Rules:

- Repo truth beats memory.
- Current docs beat imported ChatGPT memory.
- Mark stale items as stale instead of quietly relying on them.
- Add new memory only when Angel explicitly asks or when the task is to maintain
  Codex memory.
- Keep memory entries short and source-labeled.

## Cursor Audit Output

When Angel asks for a reply to Cursor, end with one code block that Angel can
paste verbatim.

Above that block, write one short line to Angel saying what you are sending and
why.

The Cursor block should be one of:

- `PLAN`: Direction is right but thin. Ask Cursor to tighten sequence, confirm
  edges, or switch to the planning color.
- `HOLES`: Something is wrong, risky, stale, or unverified. Name the hole and
  the fix direction.
- `GREEN LIGHT`: Cursor's output is solid. Say to move on and name the next
  practical step.

Use color labels only when routing Cursor mode:

- default: known implementation work
- orange: architectural or ambiguous planning
- red: root-cause debug, with explicit cleanup of instrumentation before fixing
- green: read-only investigation
- purple: genuinely independent parallel slices

Do not over-route small work into planning. Use the lightest mode that fits.

## Prompt Rules

Cursor prompts should be short and scoped.

Include:

- what to read first
- exact scope and forbidden scope
- what files or areas are likely relevant
- what not to touch
- verification to run
- when to update `AGENTS.md` Shipped log and `STATE.md`

Do not micromanage implementation details unless there is a real safety or
architecture boundary. Constrain scope, not creativity.

For UI work, explicitly route Jim or apply `angel-design-style.skill`. Cursor
should not do pure styling passes unless Angel asks for that in Cursor.

## GitHub Hygiene

Before pushing:

- `git status --short`
- fetch the target branch
- confirm ahead and behind counts
- push normally only when behind is zero

No force push, no branch deletion, no `git reset`, no `git clean`, no checkout
or restore against user work.

After push, confirm local `HEAD` and remote target point to the same hash.

## Imported File Policy

When Angel drops ChatGPT reference files into `docs/agents/codex/`, sort by name:

- Names that already exist in canonical repo docs are duplicates. Delete or move
  them out of active Codex context.
- Prompt templates go under `docs/agents/codex/templates/`.
- Audit references go under `docs/agents/codex/audits/`.
- Historical memory goes under `docs/agents/codex/context/legacy/`.
- External project context goes under `docs/agents/codex/context/external/`.

Never keep stale Companion scope docs active. Current Companion truth is the
action plan, routing index, architecture extraction, and live code.
