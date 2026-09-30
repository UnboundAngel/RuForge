import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reads the upcoming version from the repo's STATE.md at build time; the website builds from `website/`. */
export function readNextVersion(): string | null {
  try {
    const state = readFileSync(join(process.cwd(), '..', 'STATE.md'), 'utf-8');
    return state.match(/^Shipping version:\s*(\d+\.\d+\.\d+)/m)?.[1] ?? null;
  } catch {
    return null;
  }
}
