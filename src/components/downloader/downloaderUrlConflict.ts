import { youtubeUrlsMatch } from "../../youtubeUrl";

/** True when the URL already matches the main field or any active queue job URL. */
export function urlConflictsWithActiveDownloader(
  targetUrl: string,
  mainFieldUrl: string,
  jobs: Array<{ url: string; status: string }>,
): boolean {
  if (youtubeUrlsMatch(mainFieldUrl.trim(), targetUrl)) return true;
  return jobs.some(
    (j) =>
      (j.status === "queued" || j.status === "downloading" || j.status === "paused") &&
      youtubeUrlsMatch(j.url, targetUrl),
  );
}
