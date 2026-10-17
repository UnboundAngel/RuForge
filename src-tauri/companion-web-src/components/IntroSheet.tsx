import { useEffect, useRef, useState, type ReactNode } from "react";
import { m, type PanInfo } from "motion/react";
import { closeIntro, openIntro, useIntro, type Intro } from "../intro";
import { clearArtCache, formatBytes, readUsage, removeAllSaved, type StorageUsage } from "../storage";
import { readSettings, writeSettings, type OfflineSettings } from "../settings";
import { cancelAll, dismissFailed, retryFailed, startSave, useOfflineState } from "../offlineStore";
import { SHEET_CLOSE_PX, SHEET_CLOSE_VELOCITY, SHEET_TRANSITION, overlayFadeTransition } from "../motion";
import { InstallArt, OfflineArt, SaveArt } from "./IntroArt";
import { Share, SquarePlus } from "./icons";
import "./intro.css";

const LIMITS = [
  { mb: 512, label: "512 MB" },
  { mb: 1024, label: "1 GB" },
  { mb: 2048, label: "2 GB" },
  { mb: 5120, label: "5 GB" },
  { mb: 10240, label: "10 GB" },
];

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`in-switch${on ? " in-switch--on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className="in-switch-knob" />
    </button>
  );
}

function Row({ title, control, children }: { title: string; control?: ReactNode; children?: ReactNode }) {
  return (
    <div className="in-row">
      <div className="in-row-main">
        <div className="in-row-head">
          <span className="in-row-title">{title}</span>
          {control}
        </div>
        {children}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="in-step">
      <span className="in-step-n" aria-hidden>
        {n}
      </span>
      <div className="in-step-main">
        <span className="in-step-title">{title}</span>
        {children}
      </div>
    </div>
  );
}

type Content = {
  hero: ReactNode;
  title: string;
  sub: string;
  cta: string;
  rows: ReactNode;
  /** Runs for both the button and a swipe-down, so skipping never leaves a half-set state. */
  commit: () => void;
};

function LimitPills({ value, onChange }: { value: number; onChange: (mb: number) => void }) {
  return (
    <div className="in-pills" role="radiogroup" aria-label="Storage limit">
      {LIMITS.map((l) => (
        <button
          key={l.mb}
          type="button"
          role="radio"
          aria-checked={value === l.mb}
          className={`in-pill${value === l.mb ? " in-pill--on" : ""}`}
          onClick={() => onChange(l.mb)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function StorageRows() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [settings, setSettings] = useState<OfflineSettings>(() => readSettings());
  const { progress, queued, failed } = useOfflineState();
  const reload = () => void readUsage().then(setUsage);
  useEffect(reload, [progress.size === 0 && queued.size === 0]);
  const act = (fn: () => Promise<void>) => () => void fn().then(reload);
  const change = (p: Partial<OfflineSettings>) => {
    const next = { ...settings, ...p };
    setSettings(next);
    writeSettings(next);
  };
  const running = progress.size + queued.size;
  return (
    <>
      <Row title="Downloads">
        <p className="in-sub">
          {running > 0
            ? `${progress.size} downloading, ${queued.size} waiting`
            : failed.size > 0
              ? `${failed.size} failed`
              : "Nothing downloading"}
        </p>
        {running > 0 || failed.size > 0 ? (
          <div className="in-pills">
            {running > 0 ? <button type="button" className="in-pill" onClick={cancelAll}>Stop all</button> : null}
            {failed.size > 0 ? <button type="button" className="in-pill" onClick={retryFailed}>Retry failed</button> : null}
            {failed.size > 0 ? <button type="button" className="in-pill" onClick={dismissFailed}>Dismiss</button> : null}
          </div>
        ) : null}
      </Row>
      <Row title="Download what I play" control={<Switch on={settings.autosave} onChange={(v) => change({ autosave: v })} label="Autosave" />} />
      <Row title="Phone storage limit">
        <LimitPills value={settings.storageLimitMb} onChange={(mb) => change({ storageLimitMb: mb })} />
      </Row>
      <Row title="Saved on this phone">
        <p className="in-sub">{usage ? `${usage.savedCount} saved, ${formatBytes(usage.savedBytes)}` : "Checking"}</p>
        <button type="button" className="in-pill" onClick={act(removeAllSaved)}>Remove all saved</button>
      </Row>
      <Row title="Covers">
        <p className="in-sub">{usage ? `${usage.artCount} covers, ${formatBytes(usage.artBytes)}` : "Checking"}</p>
        <button type="button" className="in-pill" onClick={act(clearArtCache)}>Clear covers</button>
      </Row>
    </>
  );
}

function useContent(intro: Intro): Content {
  const [draft, setDraft] = useState<OfflineSettings>(() => readSettings());
  const patch = (p: Partial<OfflineSettings>) => setDraft((d) => ({ ...d, ...p }));
  const draftRef = useRef(draft);
  draftRef.current = draft;

  if (intro.id === "save") {
    return {
      hero: <SaveArt />,
      title: "Download to this phone",
      sub: `This ${intro.item?.mediaType === "video" ? "video" : "song"} downloads into RuForge on your phone and plays without your PC.`,
      cta: "Download",
      rows: (
        <>
          <Row
            title="Download what I play"
            control={<Switch on={draft.autosave} onChange={(v) => patch({ autosave: v })} label="Autosave" />}
          />
          <Row title="Phone storage">
            <LimitPills value={draft.storageLimitMb} onChange={(mb) => patch({ storageLimitMb: mb })} />
          </Row>
        </>
      ),
      commit: () => {
        writeSettings({ ...draftRef.current, seen: readSettings().seen });
        if (intro.item) void startSave(intro.item);
      },
    };
  }

  if (intro.id === "install") {
    return {
      hero: <InstallArt />,
      title: "Make it an app",
      sub: "Opens full screen, and iOS keeps your downloads.",
      cta: "Got it",
      rows: (
        <>
          <Step n={1} title={<>Tap <Share className="in-step-glyph" aria-label="Share" /> in Safari</>} />
          <Step n={2} title="Choose Add to Home Screen">
            <span className="in-sheetrow" aria-hidden>
              <span>Add to Home Screen</span>
              <SquarePlus size={18} />
            </span>
          </Step>
          <Step n={3} title="Open RuForge from your Home Screen and pair again" />
        </>
      ),
      commit: () => {},
    };
  }

  if (intro.id === "storage") {
    return {
      hero: <SaveArt />,
      title: "Downloads and storage",
      sub: "Saved songs play without your PC. Covers and the library list are rebuilt when you reconnect.",
      cta: "Done",
      rows: <StorageRows />,
      commit: () => {},
    };
  }

  return {
    hero: <OfflineArt />,
    title: "Can't reach your PC",
    sub: "Saved songs still play. To get the rest back, check that RuForge is open on your PC and Tailscale is connected on both.",
    cta: "Got it",
    rows: (
      <Row title="Phone storage">
        <button type="button" className="in-pill" onClick={() => { closeIntro(); openIntro("storage"); }}>Manage</button>
      </Row>
    ),
    commit: () => {},
  };
}

function Sheet({ intro, open }: { intro: Intro; open: boolean }) {
  const content = useContent(intro);
  const done = () => {
    content.commit();
    closeIntro();
  };
  const skip = () => {
    if (intro.id === "save") content.commit();
    closeIntro();
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > SHEET_CLOSE_PX || info.velocity.y > SHEET_CLOSE_VELOCITY) skip();
  };

  return (
    <div className={`in-root${open ? " in-root--open" : ""}`} aria-hidden={!open}>
      <m.button
        type="button"
        className="in-scrim"
        aria-label="Dismiss"
        tabIndex={-1}
        initial={false}
        animate={{ opacity: open ? 0.6 : 0 }}
        transition={overlayFadeTransition}
        onClick={skip}
      />
      <m.div
        className="in-panel"
        role="dialog"
        aria-label={content.title}
        initial={{ y: "100%" }}
        animate={{ y: open ? 0 : "100%" }}
        transition={SHEET_TRANSITION}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={onDragEnd}
      >
        <span className="in-grabber" aria-hidden />
        <div className="in-scroll">
          <div className="in-art" aria-hidden>
            {content.hero}
          </div>
          <h2 className="in-title">{content.title}</h2>
          <p className="in-sub">{content.sub}</p>
          {content.rows && <div className="in-rows">{content.rows}</div>}
        </div>
        <div className="in-footer">
          <button type="button" className="in-cta" onClick={done}>
            {content.cta}
          </button>
        </div>
      </m.div>
    </div>
  );
}

/** Mounted once; shows whichever intro an event requested and keeps its content through the exit slide. */
export function Intros() {
  const intro = useIntro();
  const [last, setLast] = useState<Intro | null>(null);
  useEffect(() => {
    if (intro) setLast(intro);
  }, [intro]);
  const shown = intro ?? last;
  if (!shown) return null;
  return <Sheet key={shown.id} intro={shown} open={!!intro} />;
}
