import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import { useState } from 'react';

function Card({
  className,
  imageSrc,
  imageAlt,
  title,
  description,
}: {
  className?: string;
  imageSrc: string;
  imageAlt?: string;
  title: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        'w-[300px] h-[440px] relative overflow-hidden rounded-[1.35rem]',
        'shadow-[0_12px_36px_rgb(0_0_0_/_0.25)]',
        className,
      )}
    >
      <img
        src={imageSrc}
        alt={imageAlt || ''}
        className="absolute inset-0 w-full h-full object-cover object-top"
        loading="lazy"
      />
      <div className="absolute left-[9%] right-[9%] top-[62%] bottom-[5%] flex flex-col justify-start pt-6">
        <h4 className="text-[1rem] font-bold leading-snug m-0 text-[#2c221e]" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </h4>
        <p className="text-[0.8125rem] leading-relaxed mt-1.5 m-0 text-[rgb(44_34_30_/_0.78)]" style={{ fontFamily: 'var(--font-sans)' }}>
          {description}
        </p>
      </div>
    </div>
  );
}

interface FeatureCardData {
  imageSrc: string;
  title: string;
  description: string;
}

interface FeatureStackProps {
  eyebrow: string;
  href: string;
  cards: FeatureCardData[];
  spreadDistance?: number;
  rotationAngle?: number;
}

function FeatureCardStack({
  eyebrow,
  href,
  cards,
  spreadDistance = 32,
  rotationAngle = 4,
}: FeatureStackProps) {
  const [isHovering, setIsHovering] = useState(false);
  const limited = cards.slice(0, 3);

  return (
    <div className="flex flex-col items-center gap-5">
      <h3
        className="text-[clamp(1.1rem,2vw,1.35rem)] font-bold tracking-tight text-[var(--color-rf-text)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {eyebrow}
      </h3>

      <a href={href} className="no-underline block">
        <div className="relative w-[300px] h-[440px]">
          {limited.map((card, index) => {
            const isFirst = index === 0;
            let xOffset = 0;
            let rotation = 0;

            if (limited.length > 1) {
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
                className={cn('absolute inset-0', isFirst ? 'z-10' : 'z-0')}
                initial={{ x: 0, rotate: 0 }}
                animate={{
                  x: isHovering ? xOffset : 0,
                  rotate: isHovering ? rotation : 0,
                }}
                transition={{
                  duration: 0.3,
                  ease: 'easeInOut',
                  delay: index * 0.08,
                  type: 'spring',
                  stiffness: 200,
                  damping: 20,
                }}
                {...(isFirst && {
                  onHoverStart: () => setIsHovering(true),
                  onHoverEnd: () => setIsHovering(false),
                })}
              >
                <Card
                  className={isFirst ? 'cursor-pointer' : ''}
                  imageSrc={card.imageSrc}
                  imageAlt={card.title}
                  title={card.title}
                  description={card.description}
                />
              </motion.div>
            );
          })}
        </div>
      </a>
    </div>
  );
}

export interface FeatureHubEntry {
  eyebrow: string;
  href: string;
  cards: FeatureCardData[];
}

export default function FeatureHubsGrid({ hubs }: { hubs: FeatureHubEntry[] }) {
  return (
    <div className="grid grid-cols-1 gap-16 md:grid-cols-2 lg:grid-cols-3 justify-items-center">
      {hubs.map((hub) => (
        <FeatureCardStack
          key={hub.eyebrow}
          eyebrow={hub.eyebrow}
          href={hub.href}
          cards={hub.cards}
        />
      ))}
    </div>
  );
}
