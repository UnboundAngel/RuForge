# Island agent rules

Applies under `src/components/island/`. Root [`AGENTS.md`](../../../AGENTS.md) still applies.

## Size

The island is its own `island` webview capped at 420x280. Size new variants inside that.

## Actions

Validate every action that arrives from the island against main's own state before running it.
