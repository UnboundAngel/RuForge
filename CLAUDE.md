@AGENTS.md

Read docs/agents/PERSONAL.md if it exists; it is absent on public by design.

## After every finished task

1. Run the checks that fit the change (`npx tsc --noEmit -p .`, `npx vitest run`) if not already run.
2. Commit and push follow root AGENTS.md **Trigger phrases** (`node scripts/triggers/run.mjs "commit and push" -m "<what changed>"` → `sync` only).

For UI changes, preview before handing off: run `npx vite --port 1430 --strictPort`, load the page in the preinstalled Chromium through Playwright with the Tauri IPC stubbed (`window.__TAURI_INTERNALS__`) and a fake library, screenshot each state that changed, send the screenshots to Angel, and ask for his review. Keep the harness in the scratchpad, not in the repo.
