import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { SessionState } from "../types";
import "./pair.css";

const CODE_LEN = 8;

type Screen = {
  title: string;
  sub: string;
  cardLabel?: string;
  items?: ReactNode[];
  action: string;
  footnote?: string;
};

const PC_STEPS: ReactNode[] = [
  <>Open <strong>RuForge</strong> on your PC</>,
  <>Go to <strong>Settings</strong>, then <strong>Browser companion</strong></>,
  <>Press <strong>Pair a phone</strong> and type the code it shows</>,
];

const REMOTE: Record<Exclude<SessionState, "loading" | "paired">, Screen> = {
  unpaired: {
    title: "Pair with your PC",
    sub: "Type the code from RuForge on your PC to bring your library here.",
    cardLabel: "Where to find the code",
    items: PC_STEPS,
    action: "Pair",
  },
  "session-lost": {
    title: "Pair again",
    sub: "RuForge restarted or signed this phone out. Grab a new code from your PC.",
    cardLabel: "Where to find the code",
    items: PC_STEPS,
    action: "Pair",
  },
  expired: {
    title: "That code expired",
    sub: "Codes last two minutes and work once. Show a new one on your PC.",
    cardLabel: "Where to find the code",
    items: PC_STEPS,
    action: "Pair",
  },
  disconnected: {
    title: "Can't reach your PC",
    sub: "Your phone can't see RuForge right now.",
    cardLabel: "Check these",
    items: [
      <><strong>RuForge</strong> is open on your PC</>,
      <><strong>Browser companion</strong> is on in Settings</>,
      <><strong>Tailscale</strong> is connected on this phone and your PC</>,
    ],
    action: "Try again",
    footnote: "This page also retries on its own.",
  },
};

const LOCAL_STEPS: ReactNode[] = [
  <>In <strong>RuForge</strong>, open <strong>Settings</strong>, then <strong>Browser companion</strong></>,
  <>Press <strong>Copy link</strong></>,
  <>Paste it here, or type the code at the end of the link</>,
];

const LOCAL: Record<Exclude<SessionState, "loading" | "paired">, Screen> = {
  unpaired: {
    title: "Pair this browser",
    sub: "Paste a pairing link from RuForge on this PC, or type its code.",
    cardLabel: "Where to find the link",
    items: LOCAL_STEPS,
    action: "Pair",
  },
  "session-lost": {
    title: "Pair again",
    sub: "RuForge restarted or signed this browser out. Grab a new link from Settings.",
    cardLabel: "Where to find the link",
    items: LOCAL_STEPS,
    action: "Pair",
  },
  expired: {
    title: "That link expired",
    sub: "Links last two minutes and work once. Copy a new one from Settings.",
    cardLabel: "Where to find the link",
    items: LOCAL_STEPS,
    action: "Pair",
  },
  disconnected: {
    title: "RuForge is closed",
    sub: "This browser can't reach RuForge right now.",
    cardLabel: "Check these",
    items: [
      <><strong>RuForge</strong> is open on this PC</>,
      <><strong>Browser companion</strong> is on in Settings</>,
    ],
    action: "Try again",
    footnote: "This page also retries on its own.",
  },
};

const PAIRABLE: ReadonlySet<SessionState> = new Set(["unpaired", "session-lost", "expired"]);

function isRemoteHost(): boolean {
  const h = window.location.hostname;
  return h !== "localhost" && h !== "127.0.0.1" && h !== "[::1]";
}

function isIosSafariTab(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone;
}

function cleanCode(raw: string): string {
  const fromLink = /[?&]c=([A-Za-z0-9]+)/.exec(raw)?.[1];
  return (fromLink ?? raw).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LEN);
}

function ShareGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

type Props = {
  session: SessionState;
  onRetry: () => void;
  onPair: (code: string) => Promise<"network" | "invalid" | null>;
};

export function GateCard({ session, onRetry, onPair }: Props) {
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  if (session === "loading" || session === "paired") {
    return (
      <div className="pair-screen pair-screen--center">
        <div className="pair-column">
          <img className="pair-icon" src="/apple-touch-icon.png" alt="" draggable={false} />
          <h1 className="pair-title">RuForge</h1>
          <p className="pair-sub">Loading your library</p>
          <div className="pair-progress" role="progressbar" aria-label="Loading" />
        </div>
      </div>
    );
  }

  const remote = isRemoteHost();
  const noInternet = remote && session === "disconnected" && typeof navigator !== "undefined" && !navigator.onLine;
  const screen = noInternet
    ? { ...REMOTE.disconnected, title: "No internet on this phone", sub: "Connect to Wi-Fi or mobile data, then try again.", items: undefined, cardLabel: undefined }
    : (remote ? REMOTE : LOCAL)[session];
  const showCode = PAIRABLE.has(session);
  const installHint = remote && isIosSafariTab();
  const ready = code.length === CODE_LEN;

  const submit = async (value: string) => {
    if (value.length !== CODE_LEN || pairing) return;
    setPairing(true);
    setPairError(null);
    const err = await onPair(value);
    setPairing(false);
    if (!err) return;
    setPairError(
      err === "network"
        ? "Can't reach your PC right now."
        : "That code didn't work. Show a new one on your PC.",
    );
    setShakeKey((k) => k + 1);
    setCode("");
    inputRef.current?.focus();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(code);
  };

  const activeIndex = focused && !pairing ? Math.min(code.length, CODE_LEN - 1) : -1;
  const cell = (i: number) => {
    const ch = code[i];
    const active = i === activeIndex && !ch;
    return (
      <span
        key={i}
        className={[
          "pair-cell",
          active || (i === activeIndex && ch) ? "pair-cell--active" : "",
          ch ? "pair-cell--filled" : "",
          pairError ? "pair-cell--error" : "",
        ].join(" ")}
      >
        {ch ?? (active ? <span className="pair-caret" /> : null)}
      </span>
    );
  };

  return (
    <div className="pair-screen">
      <form className="pair-column" onSubmit={onSubmit}>
        <img className="pair-icon" src="/apple-touch-icon.png" alt="" draggable={false} />
        <h1 className="pair-title">{screen.title}</h1>
        <p className="pair-sub">{screen.sub}</p>

        {installHint ? (
          <div className="pair-install">
            <span className="pair-install-tile">
              <ShareGlyph />
            </span>
            <div>
              <p className="pair-install-title">Add it to your home screen</p>
              <p className="pair-install-body">
                Tap Share, then Add to Home Screen, and pair from there. The home screen app
                signs in separately from Safari.
              </p>
            </div>
          </div>
        ) : null}

        {showCode ? (
          <>
            <label className="pair-code" onClick={() => inputRef.current?.focus()}>
              <input
                ref={inputRef}
                className="pair-code-input"
                value={code}
                onChange={(e) => {
                  const next = cleanCode(e.target.value);
                  setCode(next);
                  setPairError(null);
                  if (next.length === CODE_LEN) void submit(next);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Pairing code"
                readOnly={pairing}
              />
              <span
                key={shakeKey}
                className={`pair-cells${shakeKey > 0 ? " pair-cells--shake" : ""}`}
                aria-hidden
              >
                <span className="pair-cell-group">{[0, 1, 2, 3].map(cell)}</span>
                <span className="pair-cell-group">{[4, 5, 6, 7].map(cell)}</span>
              </span>
            </label>
            {pairError ? <p className="pair-error" role="alert">{pairError}</p> : null}
          </>
        ) : null}

        {screen.items ? (
          <div className="pair-card">
            <p className="pair-card-label">{screen.cardLabel}</p>
            <ol className="pair-steps">
              {screen.items.map((item, i) => (
                <li key={i} className="pair-step">
                  <span className="pair-step-num">{i + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="pair-footer">
          {showCode ? (
            <button type="submit" className="pair-cta" disabled={!ready || pairing}>
              {pairing ? "Pairing..." : screen.action}
            </button>
          ) : (
            <button type="button" className="pair-cta" onClick={onRetry}>
              {screen.action}
            </button>
          )}
          {screen.footnote ? <p className="pair-footnote">{screen.footnote}</p> : null}
        </div>
      </form>
    </div>
  );
}
