const BODY = "#262626";
const CARD = "#333";
const RED = "#ff0033";
const SOFT = "#ff5c7a";

function Phone({ x = 0, y = 0, w = 84, h = 150, children }: { x?: number; y?: number; w?: number; h?: number; children?: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx={14} fill={BODY} />
      <rect x={w / 2 - 10} y={7} width={20} height={4} rx={2} fill="#171717" />
      {children}
    </g>
  );
}

function Monitor({ x = 0, y = 0, lit = true }: { x?: number; y?: number; lit?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={92} height={64} rx={9} fill={BODY} />
      <rect x={6} y={6} width={80} height={46} rx={5} fill={lit ? CARD : "#1f1f1f"} />
      {lit ? (
        <>
          <rect x={14} y={16} width={22} height={22} rx={4} fill={RED} />
          <rect x={42} y={18} width={34} height={5} rx={2.5} fill="#fff" opacity={0.85} />
          <rect x={42} y={28} width={24} height={4} rx={2} fill="#4a4a4a" />
        </>
      ) : (
        <path d="M38 22l16 16M54 22L38 38" stroke="#3a3a3a" strokeWidth={3} strokeLinecap="round" />
      )}
      <rect x={38} y={64} width={16} height={8} fill={BODY} />
      <rect x={28} y={72} width={36} height={5} rx={2.5} fill={BODY} />
    </g>
  );
}

/** The PC's track travelling down to the phone. */
export function SaveArt() {
  return (
    <svg viewBox="0 0 320 200" role="img" aria-label="A song downloading from the PC to the phone">
      <Monitor x={22} y={54} />
      <g fill="none" stroke={SOFT} strokeWidth={3} strokeLinecap="round">
        <path d="M124 100h8" opacity={0.3} />
        <path d="M140 100h8" opacity={0.6} />
        <path d="M156 100h8" />
        <path d="m172 93 7 7-7 7" />
      </g>
      <Phone x={198} y={28} w={84} h={150}>
        <rect x={12} y={28} width={60} height={60} rx={10} fill={RED} />
        <path d="M42 46v16M34 54l8 8 8-8" stroke="#fff" strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x={12} y={98} width={44} height={5} rx={2.5} fill="#fff" opacity={0.85} />
        <rect x={12} y={108} width={30} height={4} rx={2} fill={CARD} />
        <rect x={12} y={126} width={60} height={5} rx={2.5} fill={CARD} />
        <rect x={12} y={126} width={38} height={5} rx={2.5} fill={RED} />
      </Phone>
    </svg>
  );
}

/** A red tile sliding into a phone home screen. */
export function InstallArt() {
  const tiles = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 3 && c === 2) continue;
      tiles.push(<rect key={`${r}${c}`} x={10 + c * 22} y={26 + r * 26} width={18} height={18} rx={5} fill={CARD} />);
    }
  }
  return (
    <svg viewBox="0 0 320 200" role="img" aria-label="App added to the home screen">
      <Phone x={118} y={28} w={84} h={150}>
        {tiles}
        <rect x={54} y={104} width={18} height={18} rx={5} fill="none" stroke="#4a4a4a" strokeWidth={1.5} strokeDasharray="3 3" />
      </Phone>
      <g transform="rotate(-8 246 64)">
        <rect x={222} y={42} width={44} height={44} rx={12} fill={RED} />
        <path d="M244 54v20M234 64h20" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
      </g>
      <g fill="none" stroke={SOFT} strokeWidth={3} strokeLinecap="round">
        <path d="M270 100l14 10" opacity={0.6} />
        <path d="M262 112l10 8" opacity={0.35} />
      </g>
    </svg>
  );
}

/** The PC is dark and cut off; the phone still shows its downloaded songs. */
export function OfflineArt() {
  return (
    <svg viewBox="0 0 320 200" role="img" aria-label="The PC is unreachable; downloaded songs are available on the phone">
      <Monitor x={22} y={54} lit={false} />
      <g stroke="#3a3a3a" strokeWidth={3} strokeLinecap="round" fill="none">
        <path d="M124 100h10" />
        <path d="M162 100h10" />
      </g>
      <g transform="translate(148 100)">
        <circle r={11} fill={RED} />
        <path d="M-4-4l8 8M4-4l-8 8" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
      </g>
      <Phone x={198} y={28} w={84} h={150}>
        <rect x={10} y={22} width={34} height={5} rx={2.5} fill={SOFT} />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(10 ${36 + i * 28})`}>
            <rect width={64} height={22} rx={7} fill={CARD} />
            <rect x={6} y={5} width={12} height={12} rx={3} fill={RED} />
            <rect x={24} y={6} width={30} height={4} rx={2} fill="#fff" opacity={0.85} />
            <rect x={24} y={13} width={20} height={3} rx={1.5} fill="#555" />
          </g>
        ))}
        <rect x={10} y={124} width={64} height={22} rx={7} fill="none" stroke="#2e2e2e" strokeDasharray="3 3" />
      </Phone>
    </svg>
  );
}
