import { YouTubeProfileChip } from "./YouTubeProfileChip";
import { useRuforgeStore } from "@/store/ruforgeStore";

type Props = {
  className?: string;
};

export function MusicProfileChip({ className }: Props) {
  const openProfilePage = useRuforgeStore((s) => s.openProfilePage);
  return (
    <YouTubeProfileChip className={className} size="md" onClick={openProfilePage} />
  );
}
