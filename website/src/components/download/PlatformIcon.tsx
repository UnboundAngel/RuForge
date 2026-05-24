import type { DownloadPlatformIconId } from '../../lib/downloadPlatformIcons';
import { downloadPlatformIconPaths } from '../../lib/downloadPlatformIcons';

type PlatformIconProps = {
  icon: DownloadPlatformIconId;
  size?: number;
  className?: string;
  label?: string;
};

export default function PlatformIcon({ icon, size = 18, className = '', label }: PlatformIconProps) {
  const path = downloadPlatformIconPaths[icon];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <path fill="currentColor" d={path} />
    </svg>
  );
}
