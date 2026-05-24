import { useCallback, useEffect, useRef, useState } from 'react';
import DownloadLanding from './DownloadLanding';
import {
  type ProgressSnapshot,
  fetchInstaller,
  runDemoDownload,
  saveBlob,
} from '../../lib/downloadProgress';
import DownloadProgressModal, { type ModalPhase } from './DownloadProgressModal';

const EMPTY_PROGRESS: ProgressSnapshot = {
  loaded: 0,
  total: null,
  speedBps: 0,
  etaSec: null,
  percent: 0,
};

export type DownloadFlowProps = {
  version: string;
  fetchUrls: string[];
  directDownloadUrl: string;
  filename: string;
  logoSrc: string;
  autoStart: boolean;
  demo: boolean;
  showLanding: boolean;
  troubleHref: string;
};

export default function DownloadFlow({
  version,
  fetchUrls,
  directDownloadUrl,
  filename,
  logoSrc,
  autoStart,
  demo: demoInitial,
  showLanding: showLandingInitial,
  troubleHref,
}: DownloadFlowProps) {
  const [started, setStarted] = useState(!showLandingInitial);
  const [modalVisible, setModalVisible] = useState(!showLandingInitial);
  const [modalPhase, setModalPhase] = useState<ModalPhase>('downloading');
  const [progress, setProgress] = useState<ProgressSnapshot>(EMPTY_PROGRESS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedBlob, setSavedBlob] = useState<Blob | null>(null);
  const [viaBrowser, setViaBrowser] = useState(false);
  const [isDemo, setIsDemo] = useState(demoInitial);

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const runDownload = useCallback(
    async (useDemo: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStarted(true);
      setModalVisible(true);
      setModalPhase('downloading');
      setErrorMessage(null);
      setSavedBlob(null);
      setViaBrowser(false);
      setProgress(EMPTY_PROGRESS);

      try {
        if (useDemo) {
          await runDemoDownload(
            controller.signal,
            (snap) => setProgress(snap),
            () => setModalPhase('processing'),
          );
          setModalPhase('complete');
          return;
        }

        const result = await fetchInstaller(
          fetchUrls,
          directDownloadUrl,
          controller.signal,
          (snap) => {
            setProgress(snap);
            if (snap.percent >= 100) setModalPhase('processing');
          },
        );

        if (result.kind === 'blob') {
          setSavedBlob(result.blob);
          saveBlob(result.blob, filename);
          setModalPhase('complete');
          return;
        }

        setProgress(EMPTY_PROGRESS);
        setModalPhase('complete');
        setViaBrowser(true);
      } catch (err) {
        if (controller.signal.aborted) {
          setModalVisible(false);
          setStarted(false);
          return;
        }
        setModalPhase('error');
        setErrorMessage(err instanceof Error ? err.message : 'Download failed');
      }
    },
    [directDownloadUrl, fetchUrls, filename],
  );

  const beginDownload = useCallback(
    (useDemo: boolean) => {
      setIsDemo(useDemo);
      void runDownload(useDemo);
    },
    [runDownload],
  );

  const beginDownloadRef = useRef(beginDownload);
  beginDownloadRef.current = beginDownload;

  useEffect(() => {
    if (startedRef.current) return;
    if (!autoStart && !demoInitial) return;
    startedRef.current = true;
    beginDownloadRef.current(demoInitial);
  }, [autoStart, demoInitial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !modalVisible) return;
      e.preventDefault();
      if (modalPhase === 'downloading') {
        abortRef.current?.abort();
      } else {
        setModalVisible(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalPhase, modalVisible]);

  const onCancel = () => {
    abortRef.current?.abort();
  };

  const onSaveAgain = () => {
    if (savedBlob) saveBlob(savedBlob, filename);
  };

  const onDone = () => {
    window.location.href = '/';
  };

  return (
    <div className="rf-dl-flow">
      {!started && showLandingInitial && (
        <DownloadLanding
          version={version}
          onDownload={() => beginDownload(false)}
        />
      )}

      <DownloadProgressModal
        visible={modalVisible}
        logoSrc={logoSrc}
        filename={filename}
        version={version}
        phase={modalPhase}
        progress={progress}
        errorMessage={errorMessage}
        viaBrowser={viaBrowser}
        onCancel={modalPhase === 'downloading' ? onCancel : undefined}
        onRetry={modalPhase === 'error' ? () => beginDownload(isDemo) : undefined}
        onSaveAgain={modalPhase === 'complete' && savedBlob ? onSaveAgain : undefined}
        onDone={modalPhase === 'complete' ? onDone : undefined}
        troubleHref={troubleHref}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}

// Demo animation only: /download?download=demo
