import { motion } from "framer-motion";
import logo from "@/assets/neotubeIcon.png";

type OnboardingWelcomeCardProps = {
  onNext: () => void;
};

export function OnboardingWelcomeCard({ onNext }: OnboardingWelcomeCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex h-[600px] w-[420px] flex-col items-center justify-between overflow-hidden rounded-[36px] border border-white/5 bg-[#271C18] p-10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent" />

      <div className="z-10 flex w-full flex-1 flex-col items-center justify-center pt-16">
        <img
          src={logo}
          alt=""
          className="mb-10 h-16 w-16 rounded-[20px] border border-white/10 object-cover shadow-xl"
        />

        <div className="flex w-full flex-col gap-5 text-center">
          <h1 className="text-[34px] font-bold leading-[1.1] tracking-tight text-stone-50">
            here&apos;s ruforge.
          </h1>
          <p className="px-3 text-[16px] font-medium leading-relaxed text-stone-400">
            the dark, tonally rich environment for your media. let&apos;s get you set up and show you around.
          </p>
        </div>
      </div>

      <div className="z-10 mt-12 w-full pb-2">
        <button
          type="button"
          onClick={onNext}
          className="w-full cursor-pointer rounded-[12px] bg-[color:var(--accent)] py-4 text-[16px] font-bold text-[#1D1613] shadow-lg transition-all hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/50"
        >
          get started
        </button>
      </div>
    </motion.div>
  );
}
