export type YoutubeUrlDropHandler = (urls: readonly string[]) => void | Promise<void>;

let handler: YoutubeUrlDropHandler | null = null;

export function setYoutubeUrlDropHandler(fn: YoutubeUrlDropHandler | null): void {
  handler = fn;
}

export function getYoutubeUrlDropHandler(): YoutubeUrlDropHandler | null {
  return handler;
}
