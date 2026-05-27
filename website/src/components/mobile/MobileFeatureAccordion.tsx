import { useState, useRef, useEffect } from 'react';
import { useHaptic } from './useHaptic';

interface FeatureItem {
  id: string;
  pill: string;
  headline: string;
  paragraph: string;
  bullets: string[];
  imageSrc: string;
  imageAlt: string;
}

interface Props {
  features: FeatureItem[];
}

function AccordionCard({ feature, isOpen, onToggle }: { feature: FeatureItem; isOpen: boolean; onToggle: () => void }) {
  const { select } = useHaptic();
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isOpen ? contentRef.current.scrollHeight : 0);
    }
  }, [isOpen]);

  return (
    <button
      onClick={() => { select(); onToggle(); }}
      className="rf-m-card w-full text-left rounded-2xl border border-rf-border/30 bg-rf-surface/30 overflow-hidden hover:border-rf-border/50"
      aria-expanded={isOpen}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={feature.imageSrc}
          alt={feature.imageAlt}
          className="w-full h-full object-cover object-top"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-rf-surface/80 to-transparent" />
      </div>

      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 text-[10px] font-semibold tracking-[0.16em] uppercase text-[#e8943a]">
            {feature.pill}
          </span>
          <span className="font-display text-base font-bold text-rf-text truncate">
            {feature.headline}
          </span>
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-rf-text-muted/60 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      <div
        style={{ height: `${height}px` }}
        className="transition-[height] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden"
      >
        <div ref={contentRef} className="px-4 pb-5">
          <p className="text-sm leading-relaxed text-rf-text-muted/90 mb-3">
            {feature.paragraph}
          </p>
          <ul className="space-y-1.5">
            {feature.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-rf-text">
                <span className="shrink-0 mt-0.5 text-[#e8943a] font-semibold leading-none">→</span>
                <span className="leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  );
}

export default function MobileFeatureAccordion({ features }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {features.map((f) => (
        <AccordionCard
          key={f.id}
          feature={f}
          isOpen={openId === f.id}
          onToggle={() => setOpenId(openId === f.id ? null : f.id)}
        />
      ))}
    </div>
  );
}
