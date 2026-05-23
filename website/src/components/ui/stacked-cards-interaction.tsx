'use client';

import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import { useState } from 'react';

export interface StackedPreviewCard {
  image: string;
  label?: string;
}

interface StackedCardsInteractionProps {
  cards: StackedPreviewCard[];
  eyebrow: string;
  spreadDistance?: number;
  rotationAngle?: number;
  animationDelay?: number;
  onOpen: () => void;
  className?: string;
}

const CARD_WIDTH = 220;
const CARD_HEIGHT = Math.round(CARD_WIDTH * (749 / 515));

function PreviewCard({ className, image }: { className?: string; image: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-rf-border/50 bg-rf-surface shadow-[0_12px_36px_rgb(0_0_0/0.35)]',
        className,
      )}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      <img src={image} alt="" className="h-full w-full object-contain object-top" loading="lazy" decoding="async" />
    </div>
  );
}

export function StackedCardsInteraction({
  cards,
  eyebrow,
  spreadDistance = 36,
  rotationAngle = 5,
  animationDelay = 0.08,
  onOpen,
  className,
}: StackedCardsInteractionProps) {
  const [isHovering, setIsHovering] = useState(false);
  const limitedCards = cards.slice(0, 3);

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <p className="font-display text-center text-sm font-bold tracking-tight text-rf-text sm:text-base">{eyebrow}</p>
      <div
        className="relative flex items-center justify-center"
        style={{ width: CARD_WIDTH + spreadDistance * 2, height: CARD_HEIGHT + 16 }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="relative" style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
          {limitedCards.map((card, index) => {
            const isFirst = index === 0;
            let xOffset = 0;
            let rotation = 0;

            if (limitedCards.length > 1) {
              if (index === 1) {
                xOffset = -spreadDistance;
                rotation = -rotationAngle;
              } else if (index === 2) {
                xOffset = spreadDistance;
                rotation = rotationAngle;
              }
            }

            return (
              <motion.div
                key={index}
                className={cn('absolute left-0 top-0', isFirst ? 'z-10' : 'z-0')}
                initial={{ x: 0, rotate: 0 }}
                animate={{
                  x: isHovering ? xOffset : 0,
                  rotate: isHovering ? rotation : 0,
                }}
                transition={{
                  duration: 0.3,
                  ease: 'easeInOut',
                  delay: index * animationDelay,
                  type: 'spring',
                  stiffness: 260,
                  damping: 22,
                }}
              >
                <PreviewCard image={card.image} className={isFirst ? undefined : 'pointer-events-none opacity-[0.92]'} />
              </motion.div>
            );
          })}
        </div>
        {limitedCards[0] && (
          <button
            type="button"
            className="absolute inset-0 z-20 cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rf-accent/60"
            aria-label={`Open ${eyebrow} tutorial`}
            onClick={onOpen}
            onFocus={() => setIsHovering(true)}
            onBlur={() => setIsHovering(false)}
          />
        )}
      </div>
      <p className="text-center text-[11px] text-rf-text-muted/70">Hover to peek · Click for full walkthrough</p>
    </div>
  );
}
