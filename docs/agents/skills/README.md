# Agent Skills

This folder stores portable agent skills used by RuForge agents. The current
files are `.skill` packages, which are zip-compatible bundles with a `SKILL.md`
entrypoint.

Root project truth still comes first:

1. `STATE.md`
2. `AGENTS.md`
3. A task-routed doc from `docs/agents/DOC-ROUTING.md`
4. A skill from this folder, or `.cursor/skills/` (release, design), only when its trigger matches the task

## How To Read A Skill

Use the package entrypoint first:

```powershell
tar -xOf docs\agents\skills\<skill-name>.skill <skill-name>/SKILL.md
```

List bundled references before opening extras:

```powershell
tar -tf docs\agents\skills\<skill-name>.skill
```

Only read referenced files that are needed for the task. Do not unpack skills
into the repo unless Angel explicitly asks.

## Agent-Neutral Rule

Some skills were originally written for Claude. Any agent may use them.

- When a skill says `Claude`, read it as `the current audit or planning agent`.
- When a skill says `Angel`, read it as the maintainer.
- When a skill says `Cursor`, read it as the IDE implementation agent.
- When a skill conflicts with `STATE.md`, `AGENTS.md`, or live code, the repo
  wins. Fix the skill or route around the stale line.

## Available Skills

| Skill | Package | Use when |
|------|---------|----------|
| RuForge design | `.cursor/skills/ruforge-design/SKILL.md` | UI chrome restrictions (bezel/well, popups, errors). Lock new patterns from the live app into `restrictions.md`. |
| RuForge release | `.cursor/skills/ruforge-release/SKILL.md` | Angel says ship / release / push it out, or the task is updater.json / gh release / a public version bump. |
| Cursor audit router | `cursor-audit-router.skill` | Auditing Cursor output or writing a message Angel will paste back into Cursor. |
| Prompt master | `prompt-master.skill` | Writing, tightening, adapting, or splitting prompts for Cursor, Codex, Gemini, Perplexity, or another AI tool. |
| Research master | `research-master.skill` | The task depends on current external facts: APIs, versions, pricing, policies, competitors, SEO, stores, hosting, AI tool capabilities, or any explicit research request. |
| Angel design style | `angel-design-style.skill` | Reviewing or prompting any user-facing UI, visual polish, page, component, layout, card, motion, or frontend surface. |

## Routing Notes

- Cursor-facing audit replies use `cursor-audit-router.skill`.
- New prompt packs use `prompt-master.skill`.
- UI prompts and UI audits also use `angel-design-style.skill`.
- Volatile external claims use `research-master.skill` before they shape a
  prompt, plan, or repo change.
- Explicit research requests use `research-master.skill` even when the user does
  not name it. The skill's job is to produce focused verification prompts for
  Google, Gemini, and Perplexity, then consolidate verified findings before
  recommendations are made.
- Skills do not replace repo docs. They supply process and style only.
