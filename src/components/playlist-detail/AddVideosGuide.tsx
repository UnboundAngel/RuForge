import { Link2, ListPlus, MousePointerClick } from "lucide-react";

const STEPS = [
  { icon: MousePointerClick, text: "Right-click any video in your library and pick Save to playlist." },
  { icon: Link2, text: "Drop a YouTube link onto this playlist's card to download straight into it." },
  { icon: ListPlus, text: "Or add one of the suggestions below." },
] as const;

/** Empty state for a video playlist: the ways in, instead of a dead end. */
export function AddVideosGuide({ title }: { title: string }) {
  return (
    <div className="my-auto flex flex-col items-center py-10 text-center">
      <h2 className="text-[17px] font-bold tracking-tight text-stone-100">Add videos to {title}</h2>
      <ol className="mt-5 space-y-4 text-left">
        {STEPS.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-start gap-3.5">
            <Icon size={17} strokeWidth={2} className="mt-px shrink-0 text-stone-400" aria-hidden />
            <span className="text-[13px] font-medium leading-snug text-stone-400">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
