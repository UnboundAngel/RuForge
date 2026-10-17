import type { CrashRecoveryVariant } from "./CrashRecoveryScreen";

type CrashRecoveryHeroProps = {
  variant: CrashRecoveryVariant;
};

const COPY: Record<CrashRecoveryVariant, { title: string; body: string }> = {
  fatal: {
    title: "ruforge ran out of memory",
    body: "the renderer stopped. close other apps, then reload.",
  },
  ui: {
    title: "uh oh.. something broke in the ui",
    body: "the app hit an unexpected error. reload usually fixes it.",
  },
};

export function CrashRecoveryHero({ variant }: CrashRecoveryHeroProps) {
  const copy = COPY[variant];
  const fatal = variant === "fatal";
  return (
    <div className="rf-crash-hero flex flex-col items-center text-center">
      <p className="rf-crash-hero__title m-0 font-display text-5xl font-extrabold tracking-tight leading-[1.1]">
        RuForge
      </p>
      <h1
        id={fatal ? undefined : "rf-crash-recovery-title"}
        className={`rf-crash-hero__headline m-0 mt-2 max-w-md tracking-tight text-[color:var(--text)] ${
          fatal ? "text-lg font-semibold" : "text-base font-medium"
        }`}
      >
        {copy.title}
      </h1>
      <p className="rf-crash-hero__body m-0 mt-3 max-w-sm text-sm leading-relaxed text-[color:var(--text-muted)]">
        {copy.body}
      </p>
    </div>
  );
}
