export type DownloaderReplayHandlers = {
  handleDownloadClick: () => void | Promise<void>;
  applyClipboardYoutubeUrl: (clipUrl: string) => void;
  handleUrlChange: (value: string) => void;
  promoteStagedBarToDownloadQueue: () => void;
  handleQuickEnqueueFromClipboard: () => void | Promise<void>;
  handleDroppedYoutubeUrls: (urls: readonly string[]) => void | Promise<void>;
};

let handlers: DownloaderReplayHandlers | null = null;

export function setDownloaderReplayHandlers(next: DownloaderReplayHandlers | null): void {
  handlers = next;
}

export function getDownloaderReplayHandlers(): DownloaderReplayHandlers | null {
  return handlers;
}
