import type { SessionState } from "../types";

const GATE_COPY: Record<
  string,
  { title: string; body: string; retry: string }
> = {
  disconnected: {
    title: "RuForge is closed or disconnected",
    body: "RuForge is not reachable on this PC. Start RuForge, enable Browser companion in Settings, then try again. This page will retry quietly in the background.",
    retry: "Try again",
  },
  "session-lost": {
    title: "Session ended",
    body: "RuForge restarted or revoked this browser session. Use Open in web from RuForge Settings on this PC to pair again.",
    retry: "Check connection",
  },
  expired: {
    title: "Link expired",
    body: "This pairing link was already used or timed out. Use Open in web from RuForge Settings. Sessions also clear when RuForge restarts.",
    retry: "Try again",
  },
  unpaired: {
    title: "Not paired",
    body: "Open in web from RuForge Settings on this PC, or use a fresh pairing link. Your session stays active until RuForge restarts.",
    retry: "Try again",
  },
};

type Props = {
  session: SessionState;
  onRetry: () => void;
};

export function GateCard({ session, onRetry }: Props) {
  if (session === "loading") {
    return (
      <div className="gate-overlay">
        <div className="gate-card">
          <div className="gate-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <h2 className="gate-title">RuForge Companion</h2>
          <p className="gate-body">Loading your library...</p>
          <div className="loading-dots">
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
        </div>
      </div>
    );
  }

  const copy = GATE_COPY[session] ?? GATE_COPY.unpaired!;

  return (
    <div className="gate-overlay">
      <div className="gate-card">
        <div className="gate-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <h2 className="gate-title">{copy.title}</h2>
        <p className="gate-body">{copy.body}</p>
        <button type="button" className="gate-btn" onClick={onRetry}>
          {copy.retry}
        </button>
      </div>
    </div>
  );
}
