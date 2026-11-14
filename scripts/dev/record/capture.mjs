// CDP screencast capture: jpeg frames on disk plus their browser timestamps.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function startCapture(page, dir) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on('Page.screencastFrame', (ev) => {
    // Ack first so Chromium keeps sending while the disk write is pending.
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    const file = join(dir, `f${String(frames.length).padStart(6, '0')}.jpg`);
    frames.push({ file, ts: ev.metadata?.timestamp ?? Date.now() / 1000 });
    writes.push(writeFile(file, Buffer.from(ev.data, 'base64')));
  });
  const t0 = Date.now() / 1000;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });
  return {
    t0,
    frames,
    async stop() {
      const endTs = Date.now() / 1000;
      await cdp.send('Page.stopScreencast').catch(() => {});
      await Promise.all(writes);
      await cdp.detach().catch(() => {});
      // Chromium only sends frames on change, so the first frame covers the time since start.
      if (frames.length) frames[0].ts = Math.min(frames[0].ts, t0);
      return { frames, endTs };
    },
  };
}
