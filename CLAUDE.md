@AGENTS.md

Read docs/agents/PERSONAL.md if it exists; it is absent on public by design.

## After every finished task

1. Run the checks that fit the change (`npx tsc --noEmit -p .`, `npx vitest run`) if not already run.
2. Commit and push follow root AGENTS.md **Trigger phrases** (`node scripts/triggers/run.mjs "commit and push" -m "<what changed>"` → `sync` only).

For UI changes, preview before handing off: screenshot each state that changed from the real running app with `node scripts/dev/shot.mjs <name> [flags]` (see root AGENTS.md "Screenshots of the app"), send the screenshots to Angel, and ask for his review. If the app is not reachable, ask Angel to start `npm run dev:app:debug`; do not build a stubbed harness.
