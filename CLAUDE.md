# RuForge: Claude Code rules

Follow `AGENTS.md` and `STATE.md` like every other agent. This file only adds Claude Code workflow.

## After every finished task

1. Run the checks that fit the change (`npx tsc --noEmit -p .`, `npx vitest run`).
2. Commit with a clear message and push the session's working branch (`git push -u origin <branch>`). Never push to `main` unless Angel asks for a release.
3. End the reply with a fenced prompt Angel can paste into Cursor to pull the work locally. Name the branch and the commit. Example:

```
Cursor (Agent mode): pull the Claude Code work.
git fetch origin
git checkout <branch>
git pull origin <branch>
Then run npm install if package-lock.json changed, and npm run dev:app.
```

For UI changes, preview before handing off: run `npx vite --port 1430 --strictPort`, load the page in the preinstalled Chromium through Playwright with the Tauri IPC stubbed (`window.__TAURI_INTERNALS__`) and a fake library, screenshot each state that changed, send the screenshots to Angel, and ask for his review. Keep the harness in the scratchpad, not in the repo. Music UI should match Spotify's layout as closely as the design rules allow.
