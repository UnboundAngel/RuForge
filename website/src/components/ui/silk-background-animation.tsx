import { useEffect, useRef } from 'react';

interface ComponentProps {
  demoMode?: boolean;
  variant?: 'purple' | 'owl';
}

export const Component = ({ demoMode = false, variant = 'purple' }: ComponentProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = 2;
    const noiseIntensity = 0.8;

    const paint = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const { width, height } = canvas;

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      if (variant === 'owl') {
        gradient.addColorStop(0, '#120d0a');
        gradient.addColorStop(0.5, '#1d1410');
        gradient.addColorStop(1, '#120d0a');
      } else {
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(0.5, '#2a2a2a');
        gradient.addColorStop(1, '#1a1a1a');
      }

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;

      const noise = (x: number, y: number) => {
        const G = 2.71828;
        const rx = G * Math.sin(G * x);
        const ry = G * Math.sin(G * y);
        return (rx * ry * (1 + x)) % 1;
      };

      for (let x = 0; x < width; x += 2) {
        for (let y = 0; y < height; y += 2) {
          const u = (x / width) * scale;
          const v = (y / height) * scale;

          const tex_x = u;
          const tex_y = v + 0.03 * Math.sin(8.0 * tex_x);

          const pattern = 0.6 + 0.4 * Math.sin(
            5.0 * (tex_x + tex_y +
              Math.cos(3.0 * tex_x + 5.0 * tex_y)) +
            Math.sin(20.0 * (tex_x + tex_y))
          );

          const rnd = noise(x, y);
          const intensity = Math.max(0, pattern - rnd / 15.0 * noiseIntensity);

          let r = 0, g = 0, b = 0;
          if (variant === 'owl') {
            r = Math.floor(80 * intensity * 0.45);
            g = Math.floor(55 * intensity * 0.45);
            b = Math.floor(35 * intensity * 0.45);
          } else {
            r = Math.floor(123 * intensity);
            g = Math.floor(116 * intensity);
            b = Math.floor(129 * intensity);
          }

          const index = (y * width + x) * 4;
          if (index < data.length) {
            data[index] = r;
            data[index + 1] = g;
            data[index + 2] = b;
            data[index + 3] = 255;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);

      const overlayGradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) / 2
      );
      overlayGradient.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
      overlayGradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');

      ctx.fillStyle = overlayGradient;
      ctx.fillRect(0, 0, width, height);
    };

    paint();
    window.addEventListener('resize', paint);

    return () => {
      window.removeEventListener('resize', paint);
    };
  }, [variant]);

  return (
    <div className={`relative w-full overflow-hidden ${demoMode ? 'h-screen' : 'h-full'}`}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
};
