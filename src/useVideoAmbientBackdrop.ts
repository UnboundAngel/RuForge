import { useEffect, useRef } from "react";

/** ~10fps blurred canvas backdrop sampled from a playing `<video>`. */
export function useVideoAmbientBackdrop(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
) {
  const ambientRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const updateAmbient = () => {
      setTimeout(() => {
        ambientRafRef.current = requestAnimationFrame(updateAmbient);
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

    ambientRafRef.current = requestAnimationFrame(updateAmbient);
    return () => {
      if (ambientRafRef.current !== null) cancelAnimationFrame(ambientRafRef.current);
    };
  }, [enabled, videoRef, canvasRef]);
}
