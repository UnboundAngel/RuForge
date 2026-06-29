/** No download bytes within this window after Install & Restart starts. */
export const UPDATER_DOWNLOAD_CONNECT_MS = 60_000;

/** No progress chunks for this long while downloading. */
export const UPDATER_DOWNLOAD_STALL_MS = 5 * 60_000;

/** NSIS install never relaunches the app within this cap. */
export const UPDATER_INSTALL_TIMEOUT_MS = 3 * 60_000;
