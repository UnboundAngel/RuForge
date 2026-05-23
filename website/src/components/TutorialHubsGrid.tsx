'use client';

import { useCallback, useState } from 'react';
import { StackedCardsInteraction } from './ui/stacked-cards-interaction';
import { TutorialHubModal, type TutorialHubData } from './ui/tutorial-hub-modal';

interface TutorialHubsGridProps {
  hubs: TutorialHubData[];
}

export default function TutorialHubsGrid({ hubs }: TutorialHubsGridProps) {
  const [activeHubId, setActiveHubId] = useState<string | null>(null);

  const activeHub = hubs.find((h) => h.id === activeHubId) ?? null;

  const closeModal = useCallback(() => setActiveHubId(null), []);

  return (
    <>
      <div className="tutorial-hubs-grid scroll-reveal">
        {hubs.map((hub) => (
          <StackedCardsInteraction
            key={hub.id}
            eyebrow={hub.eyebrow}
            cards={hub.steps.map((step) => ({
              image: step.imageSrc,
            }))}
            onOpen={() => setActiveHubId(hub.id)}
          />
        ))}
      </div>
      <TutorialHubModal hub={activeHub} onClose={closeModal} />
      <style>{`
        .tutorial-hubs-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2.5rem 1.5rem;
          justify-items: center;
        }
        @media (min-width: 640px) {
          .tutorial-hubs-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (min-width: 1024px) {
          .tutorial-hubs-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 2.75rem 1.25rem;
          }
        }
        @media (min-width: 768px) {
          .tutorial-modal-grid {
            align-items: stretch;
          }
          .tutorial-modal-card {
            display: flex;
            flex-direction: column;
            min-height: 100%;
          }
          .tutorial-modal-card > div {
            flex: 1 1 auto;
            height: 100%;
            min-height: 100%;
            aspect-ratio: unset !important;
          }
          .tutorial-modal-card img {
            height: 100%;
          }
        }
      `}</style>
    </>
  );
}
