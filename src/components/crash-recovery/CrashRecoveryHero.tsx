import { AnimatedText } from "@/components/ui/AnimatedText";
import type { CrashRecoveryVariant } from "./CrashRecoveryScreen";

type CrashRecoveryHeroProps = {
  variant: CrashRecoveryVariant;
};

const FATAL_COPY = {
  title: "ruforge ran out of memory",
  body: "the renderer stopped. close other apps, then reload.",
};

export function CrashRecoveryHero({ variant }: CrashRecoveryHeroProps) {
  if (variant === "fatal") {
    return (
      <div className="rf-crash-hero flex flex-col items-center text-center">
        <AnimatedText
          className="w-full"
          textClassName="rf-crash-hero__title font-hand text-5xl tracking-tight leading-[1.1]"
          underlineClassName="text-[var(--accent)]"
        >
          RuForge
        </AnimatedText>
        <h1
          className="rf-crash-hero__headline m-0 mt-2 max-w-md text-lg font-semibold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          {FATAL_COPY.title}
        </h1>
        <p
          className="rf-crash-hero__body m-0 mt-3 max-w-sm text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {FATAL_COPY.body}
        </p>
      </div>
    );
  }

  return (
    <div className="rf-crash-hero flex flex-col items-center text-center">
      <AnimatedText
        className="w-full"
        textClassName="rf-crash-hero__title font-hand text-5xl tracking-tight leading-[1.1]"
        underlineClassName="text-[var(--accent)]"
      >
        RuForge
      </AnimatedText>
      <h1
        id="rf-crash-recovery-title"
        className="rf-crash-hero__headline m-0 mt-2 max-w-md text-base font-medium tracking-tight"
        style={{ color: "var(--text)" }}
      >
        uh oh.. something broke in the ui
      </h1>
      <p
        className="rf-crash-hero__body m-0 mt-3 max-w-sm text-sm leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        the app hit an unexpected error. reload usually fixes it.
      </p>
    </div>
  );
}
