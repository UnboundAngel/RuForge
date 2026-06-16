import { useCallback, useEffect, useState } from "react";
import {
  loadVideoComments,
  type VideoCommentsLoadPhase,
  type VideoCommentsLoadResult,
} from "@/lib/loadVideoComments";
import type { VideoComment } from "@/lib/videoCommentsTypes";

export type VideoCommentsViewState = VideoCommentsLoadResult["status"] | "loading";

export function useVideoComments(
  mediaPath: string | null | undefined,
  sourceUrl?: string | null,
  downloadCommentsEnabled = false,
  browserCookies?: string | null,
  cookieFile?: string | null,
) {
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [viewState, setViewState] = useState<VideoCommentsViewState>("loading");
  const [loadPhase, setLoadPhase] = useState<VideoCommentsLoadPhase>("disk");
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    setRetryToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!mediaPath) {
      setComments([]);
      setViewState("missing");
      return;
    }

    let cancelled = false;
    setViewState("loading");
    setLoadPhase("disk");

    void loadVideoComments({
      mediaPath,
      sourceUrl,
      downloadCommentsEnabled,
      browserCookies,
      cookieFile,
      onPhase: (phase) => {
        if (!cancelled) setLoadPhase(phase);
      },
    })
      .then((result) => {
        if (cancelled) return;
        setViewState(result.status);
        setComments(result.status === "ready" ? result.comments : []);
      })
      .catch(() => {
        if (!cancelled) {
          setViewState("error");
          setComments([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mediaPath, sourceUrl, downloadCommentsEnabled, browserCookies, cookieFile, retryToken]);

  const loading = viewState === "loading";
  const loadingLabel =
    loadPhase === "network" ? "Fetching from YouTube…" : "Loading comments…";

  return {
    comments,
    loading,
    loadingLabel,
    viewState,
    retry,
  };
}
