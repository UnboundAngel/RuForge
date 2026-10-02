import { describe, expect, it } from 'vitest';

import { deriveCommitMessage, parseNumstat, shippedEntriesAdded } from './commit-message.mjs';

const fixPass3Numstat = parseNumstat(
  [
    '2\t0\tdocs/agents/release/shipped.jsonl',
    '2\t3\tsrc-tauri/capabilities/music-explore-webview.json',
    '63\t0\tsrc-tauri/src/capability_audit.rs',
    '10\t44\tsrc/components/music/MusicShell.tsx',
    '159\t0\tsrc/store/downloadQueueAutoSave.test.ts',
    '25\t6\tsrc/store/downloadQueueSlice.ts',
  ].join('\n'),
);

describe('push commit message', () => {
  it('leads with the newly logged shipped entry instead of the bookkeeping file', () => {
    const diff = [
      '@@ -40,0 +41,2 @@',
      '+{"v":"0.5.0","area":"Music","text":"auto-save no longer re-downloads tracks you cancelled.","files":[]}',
      '+{"v":"0.5.0","area":"Privacy","text":"the YouTube page inside Music can no longer read app events.","files":[]}',
    ].join('\n');
    const msg = deriveCommitMessage({ numstat: fixPass3Numstat, shipped: shippedEntriesAdded(diff) });
    const [subject, , ...body] = msg.split('\n');
    expect(subject).toBe('Music: auto-save no longer re-downloads tracks you cancelled');
    expect(body).toContain('- Privacy: the YouTube page inside Music can no longer read app events.');
    expect(msg).not.toMatch(/shipped\.jsonl/);
  });

  it('names the most-changed real files when nothing user-facing was logged', () => {
    const msg = deriveCommitMessage({ numstat: fixPass3Numstat, shipped: [] });
    expect(msg).toBe('Update downloadQueueAutoSave.test.ts, capability_audit.rs and 3 more');
  });

  it('keeps subjects to one short line', () => {
    const long = { area: 'Downloads', text: 'word '.repeat(40) };
    const subject = deriveCommitMessage({ numstat: fixPass3Numstat, shipped: [long] }).split('\n')[0];
    expect(subject.length).toBeLessThanOrEqual(72);
    expect(subject.endsWith('...')).toBe(true);
  });

  it('falls back to bookkeeping files only when they are all that changed', () => {
    const msg = deriveCommitMessage({ numstat: parseNumstat('3\t1\tSTATE.md'), shipped: [] });
    expect(msg).toBe('Update STATE.md');
  });

  it('returns nothing when nothing is staged', () => {
    expect(deriveCommitMessage({ numstat: [], shipped: [] })).toBeNull();
  });
});
