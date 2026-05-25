import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';
import { SITE } from '../../lib/site';
import {
  type DetectedPlatform,
  detectPlatform,
  downloadCtaLabel,
  PLATFORM_LABELS,
} from '../../lib/detectPlatform';
import PlatformIcon from './PlatformIcon';
import DownloadHeroMark from './DownloadHeroMark';
import { Component as SilkBackground } from '../ui/silk-background-animation';

type DownloadOwlHeroProps = {
  version: string;
  onDownload: () => void;
};

function HeroPlatformIcon({ platform }: { platform: DetectedPlatform }) {
  if (platform === 'mac') {
    return <Monitor size={18} strokeWidth={1.75} aria-hidden />;
  }
  return <PlatformIcon icon={platform === 'linux' ? 'linux' : 'windows'} size={18} />;
}

export default function DownloadOwlHero({
  version,
  onDownload,
}: DownloadOwlHeroProps) {
  const [platform, setPlatform] = useState<DetectedPlatform>('windows');
  const windowsReady = platform === 'windows';

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return (
    <div className="relative flex w-full min-h-screen flex-col items-center justify-center overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <SilkBackground demoMode={false} variant="owl" />
      </div>

      <div className="relative z-10 flex items-center justify-center">
        <DownloadHeroMark
          onActivate={windowsReady ? onDownload : undefined}
        />
      </div>

      <h1 className="relative z-10 mt-6 text-center font-display text-4xl font-bold tracking-tight text-rf-text md:text-5xl">
        {SITE.name}
      </h1>

      <button
        type="button"
        className="relative z-10 mt-8 flex items-center gap-2.5 rounded-full border border-rf-border bg-rf-surface/80 px-8 py-3 text-sm font-medium text-rf-text backdrop-blur-sm transition-all duration-150 hover:bg-rf-surface hover:scale-[1.03] active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-rf-accent/40 focus:ring-offset-2 focus:ring-offset-rf-bg disabled:opacity-40 disabled:pointer-events-none"
        onClick={windowsReady ? onDownload : undefined}
        disabled={!windowsReady}
        aria-disabled={!windowsReady}
      >
        <HeroPlatformIcon platform={platform} />
        <span>{downloadCtaLabel(platform)}</span>
      </button>

      {!windowsReady && (
        <p className="relative z-10 mt-3 text-center text-xs text-rf-text-muted/70">
          {PLATFORM_LABELS[platform]} is not available yet.
        </p>
      )}

      <p className="relative z-10 mt-4 text-xs text-rf-text-muted/50">
        v{version}
      </p>

      <p className="relative z-10 mt-6 text-xs text-rf-text-muted/40">
        <a
          href={SITE.github}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          View releases on GitHub
        </a>
      </p>
    </div>
  );
}
