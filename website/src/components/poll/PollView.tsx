import { useEffect, useState } from "react";
import { fetchPoll, sendVote, type PollData, type PollLoad } from "../../lib/pollApi";
import { mockLoad, mockVote } from "../../lib/pollMock";

interface Props {
  mobile?: boolean;
}

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

function mockKind(): string | null {
  if (!import.meta.env.DEV) return null;
  return new URLSearchParams(location.search).get("mock");
}

function formatEnds(ends: string): string {
  const [y, m, d] = ends.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Message({ children, home }: { children: string; home: string }) {
  return (
    <p className="text-base text-rf-text-muted">
      {children}{" "}
      <a href={home} className="rf-inline-link">
        Back to home
      </a>
    </p>
  );
}

function Results({ poll }: { poll: PollData }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const meta = [
    `${poll.total} ${poll.total === 1 ? "vote" : "votes"}`,
    poll.closed ? "Closed" : poll.ends ? `Ends ${formatEnds(poll.ends)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <ul className="mt-8 flex flex-col gap-2">
        {poll.options.map((o) => {
          const share = poll.total ? o.count / poll.total : 0;
          const picked = poll.voted === o.id;
          return (
            <li key={o.id} className={`relative overflow-hidden rounded-xl bg-rf-surface`}>
              <div
                className={`absolute inset-0 origin-left motion-reduce:transition-none ${picked ? "bg-[color-mix(in_srgb,var(--color-rf-accent)_30%,var(--color-rf-surface))]" : "bg-rf-raised"}`}
                style={{
                  transform: `scaleX(${shown ? share : 0})`,
                  transition: `transform 700ms ${EASE}`,
                }}
              />
              <div className="relative flex items-center justify-between gap-4 px-4 py-3.5">
                <span className={`text-[15px] ${picked ? "font-semibold text-rf-accent" : "text-rf-text"}`}>{o.label}</span>
                <span className="text-sm tabular-nums text-rf-text-muted">{Math.round(share * 100)}%</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-rf-text-muted">{meta}</p>
    </>
  );
}

function Ballot({ poll, mobile, onVoted }: { poll: PollData; mobile: boolean; onVoted: (poll: PollData) => void }) {
  // The app's bell links here with ?pick=<option>; only a real option id preselects.
  const [pick, setPick] = useState<string | null>(() => {
    const want = new URLSearchParams(location.search).get("pick");
    return poll.options.some((o) => o.id === want) ? want : null;
  });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const press = mobile ? "rf-m-btn" : "";

  async function submit() {
    if (!pick || busy) return;
    setBusy(true);
    setFailed(false);
    const mock = mockKind();
    const next = mock ? mockVote(pick) : await sendVote(poll.id, pick);
    setBusy(false);
    if (next) onVoted(next);
    else setFailed(true);
  }

  return (
    <>
      <div role="radiogroup" aria-label={poll.title} className="mt-8 flex flex-col gap-2">
        {poll.options.map((o) => {
          const on = pick === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPick(o.id)}
              className={`${press} rounded-xl px-4 py-3.5 text-left text-[15px] transition-colors duration-150 ${
                on ? "bg-rf-accent font-semibold text-rf-bg" : "bg-rf-surface text-rf-text hover:bg-rf-raised"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!pick || busy}
        onClick={submit}
        className={`${press} mt-6 rounded-xl bg-rf-accent px-7 py-3 text-sm font-semibold text-rf-bg transition-[opacity,transform] duration-150 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-rf-raised disabled:text-rf-text-muted`}
      >
        Vote
      </button>
      {failed && <p className="mt-4 text-sm text-rf-text-muted">Your vote did not go through. Try again in a moment.</p>}
    </>
  );
}

export default function PollView({ mobile = false }: Props) {
  const [state, setState] = useState<PollLoad | null>(null);
  const home = mobile ? "/m/" : "/";

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id");
    const mock = mockKind();
    if (mock) {
      setState(mockLoad(mock === "1" ? "vote" : mock));
      return;
    }
    if (!id) {
      setState({ kind: "missing" });
      return;
    }
    let live = true;
    fetchPoll(id).then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, []);

  if (!state) return <div className="h-40" aria-hidden="true" />;
  if (state.kind === "missing") return <Message home={home}>This poll does not exist.</Message>;
  if (state.kind === "down") return <Message home={home}>Polls are unavailable right now.</Message>;

  const poll = state.poll;
  const showResults = poll.closed || poll.voted !== null;
  return (
    <article>
      <h1 className="font-display text-3xl font-bold tracking-tight text-rf-text sm:text-4xl">{poll.title}</h1>
      <p className="mt-4 text-base leading-relaxed text-rf-text-muted">{poll.body}</p>
      {showResults ? (
        <Results poll={poll} />
      ) : (
        <Ballot poll={poll} mobile={mobile} onVoted={(next) => setState({ kind: "ready", poll: next })} />
      )}
    </article>
  );
}
