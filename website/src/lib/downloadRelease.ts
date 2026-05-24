import { SITE } from './site';

export function releaseTag(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

export function windowsInstallerFilename(version: string = SITE.latestVersion): string {
  return `RuForge_${version}_x64-setup.exe`;
}

/** GitHub Releases asset (may block cross-origin fetch in the browser). */
export function windowsInstallerDownloadUrl(version: string = SITE.latestVersion): string {
  const tag = releaseTag(version);
  return `${SITE.releases}/download/${tag}/${windowsInstallerFilename(version)}`;
}

/** Same-origin copy for site-hosted download (put file in website/public/releases/). */
export function siteHostedInstallerUrl(version: string = SITE.latestVersion): string {
  return `/releases/${windowsInstallerFilename(version)}`;
}

/** Same-origin mirror first (when deployed), then GitHub (often CORS-blocked in browser). */
export function installerFetchUrls(version: string = SITE.latestVersion): string[] {
  return [siteHostedInstallerUrl(version), windowsInstallerDownloadUrl(version)];
}

/** Browser navigation fallback when `fetch` cannot stream (GitHub CORS). */
export function directInstallerDownloadUrl(version: string = SITE.latestVersion): string {
  return windowsInstallerDownloadUrl(version);
}

export function releaseNotesUrl(version: string = SITE.latestVersion): string {
  return `${SITE.releases}/tag/${releaseTag(version)}`;
}
