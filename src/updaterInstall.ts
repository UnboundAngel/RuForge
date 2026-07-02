/** No download bytes within this window after Install & Restart starts. */
export const UPDATER_DOWNLOAD_CONNECT_MS = 60_000;

/** No progress chunks for this long while downloading. */
export const UPDATER_DOWNLOAD_STALL_MS = 5 * 60_000;

/** `downloadAndInstall` still pending past this cap after download Finished → failure. */
export const UPDATER_INSTALL_TIMEOUT_MS = 3 * 60_000;
