import type { DetectedPlatform } from '../../lib/detectPlatform';
import { OS_ICONS } from '../../lib/osIcons';

export default function OsIcon({ os, size = 16 }: { os: DetectedPlatform; size?: number }) {
  const { paths, filled } = OS_ICONS[os];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? undefined : 'currentColor'}
      strokeWidth={filled ? undefined : 1.75}
      strokeLinecap="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
