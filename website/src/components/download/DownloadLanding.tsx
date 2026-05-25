import { useEffect, useState } from 'react';
import { Download, Monitor } from 'lucide-react';
import { SITE } from '../../lib/site';
import {
  type DetectedPlatform,
  detectPlatform,
  downloadCtaLabel,
  PLATFORM_LABELS,
} from '../../lib/detectPlatform';
import { LINUX_PACKAGE_ROWS } from '../../lib/downloadPlatformIcons';
import PlatformIcon from './PlatformIcon';
import DownloadHeroMark from './DownloadHeroMark';

const COMING_SOON = 'Coming soon';

type DownloadLandingProps = {
  version: string;
  onDownload: () => void;
};

function HeroPlatformIcon({ platform }: { platform: DetectedPlatform }) {
  if (platform === 'mac') {
    return <Monitor size={18} strokeWidth={1.75} aria-hidden />;
  }
  return <PlatformIcon icon={platform === 'linux' ? 'linux' : 'windows'} size={18} />;
}

export default function DownloadLanding({
  version,
  onDownload,
}: DownloadLandingProps) {
  const [platform, setPlatform] = useState<DetectedPlatform>('windows');
  const windowsReady = platform === 'windows';

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return (
    <div className="rf-dl-page">
      <section className="rf-dl-hero" aria-labelledby="rf-dl-hero-title">
        <DownloadHeroMark
          onActivate={windowsReady ? onDownload : undefined}
        />

        <h1 id="rf-dl-hero-title" className="rf-dl-hero-title">
          {windowsReady ? (
            <button
              type="button"
              className="rf-dl-hero-title-btn"
              onClick={onDownload}
              title="Download RuForge"
            >
              {SITE.name}
            </button>
          ) : (
            SITE.name
          )}
        </h1>

        <button
          type="button"
          className="rf-dl-hero-cta"
          onClick={windowsReady ? onDownload : undefined}
          disabled={!windowsReady}
          aria-disabled={!windowsReady}
        >
          <HeroPlatformIcon platform={platform} />
          <span>{downloadCtaLabel(platform)}</span>
        </button>

        {!windowsReady && (
          <p className="rf-dl-hero-hint">
            {PLATFORM_LABELS[platform]} is not available yet. Use the Windows installer below for now.
          </p>
        )}

        <p className="rf-dl-hero-meta">Latest release v{version}</p>
      </section>

      <section className="rf-dl-panel" aria-labelledby="rf-dl-panel-title">
        <h2 id="rf-dl-panel-title" className="rf-dl-panel-title">
          App
        </h2>

        <ul className="rf-dl-list">
          <li className="rf-dl-row rf-dl-row--active">
            <span className="rf-dl-row-label">Windows</span>
            <div className="rf-dl-row-links">
              <button type="button" className="rf-dl-row-link" onClick={onDownload}>
                <Download size={16} strokeWidth={2} aria-hidden className="rf-dl-row-link-icon" />
                <span>Universal</span>
              </button>
            </div>
          </li>

          <li className="rf-dl-row">
            <span className="rf-dl-row-label">macOS</span>
            <div className="rf-dl-row-links">
              <span className="rf-dl-soon">{COMING_SOON}</span>
            </div>
          </li>

          <li className="rf-dl-row rf-dl-row--linux">
            <span className="rf-dl-row-label">Linux</span>
            <div className="rf-dl-linux-options">
              <ul className="rf-dl-format-list" aria-label="Linux packages (coming soon)">
                {LINUX_PACKAGE_ROWS.map((pkg) => (
                  <li key={pkg.id}>
                    <span className="rf-dl-format-opt" aria-disabled="true">
                      <Download size={14} strokeWidth={2} aria-hidden className="rf-dl-format-opt-icon" />
                      <span>{pkg.label}</span>
                    </span>
                    {pkg.note ? <span className="rf-dl-format-note">{pkg.note}</span> : null}
                  </li>
                ))}
              </ul>
              <span className="rf-dl-soon rf-dl-soon--linux">{COMING_SOON}</span>
            </div>
          </li>
        </ul>
      </section>

      <p className="rf-dl-github">
        <a href={SITE.github} target="_blank" rel="noopener noreferrer">
          View releases on GitHub
        </a>
      </p>
    </div>
  );
}
