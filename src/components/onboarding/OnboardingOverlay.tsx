import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { OnboardingFeatureStepCard, type OnboardingFeatureStep } from "./OnboardingFeatureStepCard";
import { OnboardingWelcomeCard } from "./OnboardingWelcomeCard";

const DEFAULT_FEATURE_STEPS: OnboardingFeatureStep[] = [
  {
    title: "seamless navigation.",
    description:
      "hold alt to instantly access any panel. it's faster than clicking and keeps your hands on the keyboard.",
  },
  {
    title: "sponsorblock integrated.",
    description:
      "automatically skip intros, outros, and sponsor segments in supported media with zero configuration.",
  },
  {
    title: "focus mode.",
    description:
      "press f to dim surrounding elements and put your media center-stage with zero distractions.",
  },
  {
    title: "ready to forge.",
    description: "that's the basics. drop some media in and experience it yourself.",
  },
];

type OnboardingOverlayProps = {
  steps?: readonly OnboardingFeatureStep[];
  onComplete: () => void;
};

export function OnboardingOverlay({
  steps = DEFAULT_FEATURE_STEPS,
  onComplete,
}: OnboardingOverlayProps) {
  const [currentView, setCurrentView] = useState<"welcome" | "features">("welcome");
  const [featureStep, setFeatureStep] = useState(0);

  const handleStart = () => setCurrentView("features");

  const handleFeatureNext = () => {
    if (featureStep < steps.length - 1) {
      setFeatureStep((prev) => prev + 1);
      return;
    }
    onComplete();
  };

  const handleFeatureSkip = () => {
    onComplete();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentView === "welcome") {
        if (e.key === "ArrowRight" || e.key === "Enter") {
          handleStart();
        }
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (featureStep < steps.length - 1) {
          setFeatureStep((prev) => prev + 1);
        } else {
          onComplete();
        }
      } else if (e.key === "Escape") {
        onComplete();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentView, featureStep, onComplete, steps.length]);

  return (
    <div className="fixed inset-0 z-[150] flex select-none items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[#110D0B]/80 backdrop-blur-sm" aria-hidden />

      <div className="relative z-10 flex h-full w-full max-w-[1200px] items-center justify-center">
        <AnimatePresence mode="wait">
          {currentView === "welcome" ? (
            <OnboardingWelcomeCard key="welcome" onNext={handleStart} />
          ) : (
            <OnboardingFeatureStepCard
              key="features"
              step={featureStep}
              steps={steps}
              onNext={handleFeatureNext}
              onSkip={handleFeatureSkip}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
