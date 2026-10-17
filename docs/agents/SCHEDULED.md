# Scheduled features

A scheduled feature is built now, ships dark inside the signed app, and stays out of the public repo until its date. On the date it turns on by itself in every installed copy that has it; no release is needed that day.

Use it only when Angel says a feature is scheduled ("release it on Christmas", "hold this until X"). Everything else ships the normal way.

## Where the code goes

| Part | Path | Public? |
| --- | --- | --- |
| Manifest | `src/scheduled/<id>/feature.json` | no, until released |
| Frontend | `src/scheduled/<id>/index.tsx` + anything else in that folder | no, until released |
| Plan / notes | `src/scheduled/<id>/PLAN.md` | no, until released |
| Rust (optional) | `src-tauri/src/scheduled/<id_snake>/mod.rs` | no, until released |
| Mount points | `ScheduledSlots` in `src/lib/scheduled/registry.ts` | yes, keep slot names generic |
| Server switch | `website/public/unlocks.json` | yes |

Start every one with the tool, never by hand:

```
node scripts/scheduled.mjs add <id> --unlock YYYY-MM-DD [--rust] [--title "..."]
```

## Rules

1. **Core never imports a feature.** Core renders `<ScheduledSlot name="..." />` (`src/components/scheduled/ScheduledSlot.tsx`); the feature's `index.tsx` fills slots. A direct import breaks the public build and fails `src/scheduledBoundary.test.ts`. Need a new mount point: add a generic slot name to `ScheduledSlots`.
2. **Rust goes through one command.** The feature's `mod.rs` exports `dispatch(app, method, args)`; the frontend calls `invokeScheduled(id, method, args)` (`src/lib/scheduled/status.ts`). Rust refuses while locked. Never add a scheduled command to `generate_handler!`; build.rs generates the dispatcher.
3. **No traces outside the folder.** The id, its snake_case form, and every `leakTerms` entry must not appear in any public file: no Shortcuts rows, changelog or `shipped.jsonl` lines, roadmap entries, website copy, comments or docs outside the folder. `publish-snapshot.mjs` refuses to publish if they do; `node scripts/scheduled.mjs check` shows it early (pre-push warns). Add names a user would recognise to `leakTerms`.
4. **Settings and shortcuts.** There is no slot in Settings or the Shortcuts registry yet. If a scheduled feature needs one, add a generic slot for it first; never put the row in public code.
5. **Do not log it** in `shipped.jsonl` until `release`.
6. **Index file has no side effects.** It is loaded lazily, only after unlock.

## Unlocking

- Default: local midnight on `unlockAt`, using the server's clock (`Date` header from `ruforge.app/unlocks.json`) when the app reached it this launch, so moving the PC clock does nothing while online. Offline falls back to the PC clock.
- The app fetches `unlocks.json` once per launch, only when the build contains a locked feature, never in dev.
- Server overrides, per feature: `open` (now), `hold` (keep locked past the date), or a new date.
  `node scripts/scheduled.mjs server <id> open|hold|YYYY-MM-DD|clear`, then publish that one file with `--only website/public/unlocks.json`. The entry names the feature publicly, so add one only when needed.
- Dev builds: every feature is unlocked. Set `RUFORGE_SCHEDULED_LOCKED=1` before `npm run dev:app` to see the locked state.

## Shipping timeline

1. Build any time on `sync` like normal work.
2. Make sure it is inside a signed release users have before the date (any normal release does it; the code is in the binary, just dark).
3. On or after the date: `node scripts/scheduled.mjs release <id>`, log it in `shipped.jsonl`, commit and push. The next snapshot publishes the source.
4. Later, optional: move the code out of `src/scheduled/` into its normal home and drop the slot.

`node scripts/scheduled.mjs list` shows every feature, its date and server state.

## Limits

Secret means "not on GitHub and not visible in the app", not "secure". The bundled JS of a signed build can be extracted by someone determined. Paid features stay on the Games path.
