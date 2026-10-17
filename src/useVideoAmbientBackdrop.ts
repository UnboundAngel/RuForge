import { useEffect } from "react";

/** ~10fps blurred canvas backdrop sampled from a playing `<video>`. */
export function useVideoAmbientBackdrop(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let rafId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const updateAmbient = () => {
      rafId = null;
      if (cancelled) return;
      // Cleanup must clear this timer too, or the chain outlives the effect and stacks on every remount.
      timerId = setTimeout(() => {
        timerId = null;
        if (!cancelled) rafId = requestAnimationFrame(updateAmbient);
      }, 100);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.paused || video.ended || video.readyState < 2) return;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx || video.videoWidth === 0) return;

      const targetWidth = 16;
      const targetHeight = Math.max(
        1,
        Math.floor(targetWidth * (video.videoHeight / video.videoWidth)),
      );

      if (canvas.width !== targetWidth) canvas.width = targetWidth;
      if (canvas.height !== targetHeight) canvas.height = targetHeight;

      ctx.globalAlpha = 0.2;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    };

    rafId = requestAnimationFrame(updateAmbient);
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [enabled, videoRef, canvasRef]);
}
