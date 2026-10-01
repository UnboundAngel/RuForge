import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reads the upcoming version from the repo's STATE.md at build time; the website builds from `website/`. Drops a `.0` patch so `0.5.0` reads as `0.5`. */
export function readNextVersion(): string | null {
  try {
    const state = readFileSync(join(process.cwd(), '..', 'STATE.md'), 'utf-8');
    const version = state.match(/^Shipping version:\s*(\d+\.\d+\.\d+)/m)?.[1];
    return version ? version.replace(/\.0$/, '') : null;
  } catch {
    return null;
  }
}
