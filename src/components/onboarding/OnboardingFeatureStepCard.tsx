import { AnimatePresence, motion } from "framer-motion";
import { Image as ImageIcon } from "lucide-react";

export type OnboardingFeatureStep = {
  title: string;
  description: string;
};

type OnboardingFeatureStepCardProps = {
  step: number;
  steps: readonly OnboardingFeatureStep[];
  onNext: () => void;
  onSkip: () => void;
};

export function OnboardingFeatureStepCard({
  step,
  steps,
  onNext,
  onSkip,
}: OnboardingFeatureStepCardProps) {
  const currentStep = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className="relative flex h-[600px] w-[420px] flex-col overflow-hidden rounded-[36px] bg-[#1D1613] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#271C18] via-[#1D1613] to-[#110D0B]">
        <div className="mt-[-140px] flex flex-col items-center gap-4 text-stone-600 opacity-60">
          <ImageIcon className="h-14 w-14" strokeWidth={1} />
          <span className="text-[12px] font-bold uppercase tracking-[0.2em]">
            Media Placeholder {step + 1}
          </span>
        </div>
      </div>

      <div className="absolute inset-x-3 bottom-3 flex flex-col rounded-[28px] border border-white/10 bg-[#271C18]/70 p-7 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] backdrop-blur-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mb-8 flex flex-col gap-2.5"
          >
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400">
              Step {step + 1} of {steps.length}
            </div>
            <h2 className="text-[26px] font-bold leading-[1.1] tracking-tight text-stone-50">
              {currentStep.title}
            </h2>
            <p className="mt-1 min-h-[66px] text-[15px] font-medium leading-relaxed text-stone-400">
              {currentStep.description}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2" role="group" aria-label="Onboarding progress">
            {steps.map((_, i) => (
              <div
                key={i}
                role="status"
                aria-label={`Step ${i + 1} of ${steps.length}`}
                aria-current={i === step ? "step" : "false"}
                className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? "bg-[color:var(--accent)] shadow-[0_0_8px_var(--accent-glow)]"
                    : "bg-white/20"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip onboarding"
              className={`cursor-pointer text-[14px] font-bold text-stone-400 transition-colors hover:text-stone-100 focus-visible:outline-none ${isLast ? "pointer-events-none opacity-0" : ""}`}
            >
              skip
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label={isLast ? "Finish onboarding" : "Go to next step"}
              className="cursor-pointer rounded-[12px] bg-[color:var(--accent)] px-6 py-3 text-[15px] font-bold text-[#1D1613] shadow-lg transition-all hover:brightness-110 active:scale-[0.96] focus-visible:outline-none"
            >
              {isLast ? "done" : "next"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
