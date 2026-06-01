import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import stick0Url from "@/assets/animated-empty-sticks/stick0.svg";
import stick1Url from "@/assets/animated-empty-sticks/stick1.svg";
import stick2Url from "@/assets/animated-empty-sticks/stick2.svg";
import stick3Url from "@/assets/animated-empty-sticks/stick3.svg";

type StickFigure = {
  top?: string;
  bottom?: string;
  src: string;
  transform?: string;
  speedX: number;
  speedRotation?: number;
  animate?: boolean;
};

const STICK_FIGURES: StickFigure[] = [
  {
    top: "0%",
    src: stick0Url,
    transform: "rotateZ(-90deg)",
    speedX: 1500,
    animate: true,
  },
  {
    top: "10%",
    src: stick1Url,
    speedX: 3000,
    speedRotation: 2000,
    animate: true,
  },
  {
    top: "20%",
    src: stick2Url,
    speedX: 5000,
    speedRotation: 1000,
    animate: true,
  },
  {
    top: "25%",
    src: stick0Url,
    speedX: 2500,
    speedRotation: 1500,
    animate: true,
  },
  {
    top: "35%",
    src: stick0Url,
    speedX: 2000,
    speedRotation: 300,
    animate: true,
  },
  {
    bottom: "5%",
    src: stick3Url,
    speedX: 0,
    animate: false,
  },
];

type Circulo = { x: number; y: number; size: number };

function CharactersAnimation({ hostRef }: { hostRef: React.RefObject<HTMLDivElement | null> }) {
  const charactersRef = useRef<HTMLDivElement>(null);
  const animationsRef = useRef<Animation[]>([]);

  const mountFigures = useCallback(() => {
    const host = hostRef.current;
    const layer = charactersRef.current;
    if (!host || !layer) return;

    animationsRef.current.forEach((a) => a.cancel());
    animationsRef.current = [];
    layer.innerHTML = "";

    STICK_FIGURES.forEach((figure) => {
      const stick = document.createElement("img");
      stick.className = "rf-animated-empty-character";
      stick.style.position = "absolute";
      stick.style.width = "18%";
      stick.style.height = "18%";
      stick.style.pointerEvents = "none";
      if (figure.top) stick.style.top = figure.top;
      if (figure.bottom) stick.style.bottom = figure.bottom;
      stick.src = figure.src;
      if (figure.transform) stick.style.transform = figure.transform;
      layer.appendChild(stick);

      if (!figure.animate) return;

      const move = stick.animate(
        [{ left: "100%" }, { left: "-20%" }],
        { duration: figure.speedX, easing: "linear", fill: "forwards" },
      );
      animationsRef.current.push(move);

      if (figure.speedRotation) {
        const spin = stick.animate(
          [{ transform: "rotate(0deg)" }, { transform: "rotate(-360deg)" }],
          { duration: figure.speedRotation, iterations: Infinity, easing: "linear" },
        );
        animationsRef.current.push(spin);
      }
    });
  }, [hostRef]);

  useEffect(() => {
    mountFigures();
    const host = hostRef.current;
    if (!host) return () => undefined;

    const ro = new ResizeObserver(() => mountFigures());
    ro.observe(host);
    return () => {
      ro.disconnect();
      animationsRef.current.forEach((a) => a.cancel());
      if (charactersRef.current) charactersRef.current.innerHTML = "";
    };
  }, [hostRef, mountFigures]);

  return <div ref={charactersRef} className="absolute inset-0 w-full h-full overflow-hidden" aria-hidden />;
}

function resolveBubbleColor(host: HTMLElement | null): string {
  if (!host) return "#ffffff";
  const fromVar = getComputedStyle(host).getPropertyValue("--rf-empty-bubble-color").trim();
  return fromVar || "#ffffff";
}

function CircleAnimation({ hostRef }: { hostRef: React.RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestIdRef = useRef<number | undefined>(undefined);
  const timerRef = useRef(0);
  const circulosRef = useRef<Circulo[]>([]);

  const initArr = useCallback((width: number, height: number) => {
    circulosRef.current = [];
    for (let index = 0; index < 300; index++) {
      const randomX =
        Math.floor(Math.random() * (width * 3 - width * 1.2 + 1)) + width * 1.2;
      const randomY =
        Math.floor(Math.random() * (height - height * -0.2 + 1)) + height * -0.2;
      const size = width / 1000;
      circulosRef.current.push({ x: randomX, y: randomY, size });
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    timerRef.current += 1;
    context.setTransform(1, 0, 0, 1, 0, 0);

    const distanceX = canvas.width / 80;
    const growthRate = canvas.width / 1000;

    context.fillStyle = resolveBubbleColor(hostRef.current);
    context.clearRect(0, 0, canvas.width, canvas.height);

    circulosRef.current.forEach((circulo) => {
      context.beginPath();

      if (timerRef.current < 65) {
        circulo.x -= distanceX;
        circulo.size += growthRate;
      } else if (timerRef.current < 500) {
        circulo.x -= distanceX * 0.02;
        circulo.size += growthRate * 0.2;
      }

      context.arc(circulo.x, circulo.y, circulo.size, 0, Math.PI * 2);
      context.fill();
    });

    if (timerRef.current > 500) {
      if (requestIdRef.current !== undefined) cancelAnimationFrame(requestIdRef.current);
      return;
    }

    requestIdRef.current = requestAnimationFrame(draw);
  }, [hostRef]);

  const start = useCallback(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    canvas.width = w;
    canvas.height = h;

    timerRef.current = 0;
    if (requestIdRef.current !== undefined) cancelAnimationFrame(requestIdRef.current);
    initArr(w, h);
    draw();
  }, [draw, hostRef, initArr]);

  useEffect(() => {
    start();
    const host = hostRef.current;
    if (!host) return () => undefined;

    const ro = new ResizeObserver(() => start());
    ro.observe(host);
    return () => {
      ro.disconnect();
      if (requestIdRef.current !== undefined) cancelAnimationFrame(requestIdRef.current);
    };
  }, [hostRef, start]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden />;
}

export type AnimatedEmptyStageProps = {
  className?: string;
  children?: ReactNode;
  /** Delay before children fade in (ms). */
  revealDelayMs?: number;
};

/** Black stage + growing circles + stick figures; children centered on top. */
export function AnimatedEmptyStage({
  className = "",
  children,
  revealDelayMs = 1200,
}: AnimatedEmptyStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), reduceMotion ? 0 : revealDelayMs);
    return () => window.clearTimeout(timer);
  }, [revealDelayMs, reduceMotion]);

  return (
    <div
      ref={hostRef}
      className={`rf-animated-empty-stage relative w-full h-full min-h-[360px] overflow-hidden bg-black ${className}`.trim()}
    >
      {reduceMotion ? (
        <div className="absolute inset-0 rf-animated-empty-static-fill" aria-hidden />
      ) : (
        <>
          <CircleAnimation hostRef={hostRef} />
          <CharactersAnimation hostRef={hostRef} />
        </>
      )}
      {children && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center px-6 py-10 pointer-events-none">
          <div
            className={`flex flex-col items-center text-center pointer-events-auto transition-opacity duration-500 max-w-lg w-full ${
              revealed ? "opacity-100" : "opacity-0"
            }`}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/** Full-viewport 404 demo (reference layout). */
export default function NotFoundPage() {
  return (
    <div className="w-full h-screen bg-black overflow-hidden flex justify-center items-center relative">
      <AnimatedEmptyStage revealDelayMs={1200}>
        <p className="text-[35px] font-semibold text-black m-[1%]">Page Not Found</p>
        <p className="text-[80px] font-bold text-black m-[1%] leading-none">404</p>
        <p className="text-[15px] w-full max-w-md text-center text-black m-[1%] leading-relaxed">
          The page you are looking for might have been removed, had its name changed, or is
          temporarily unavailable.
        </p>
      </AnimatedEmptyStage>
    </div>
  );
}
