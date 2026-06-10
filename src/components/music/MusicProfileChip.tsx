import { YouTubeProfileChip } from "./YouTubeProfileChip";

type Props = {
  className?: string;
};

export function MusicProfileChip({ className }: Props) {
  return <YouTubeProfileChip className={className} size="md" />;
}
