import { useCallback, useEffect, useRef, useState } from 'react';
import DownloadOwlHero from './DownloadOwlHero';
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

const LOGO_SRC = '/download-owl.png';

export type DownloadOwlFlowProps = {
  version: string;
  fetchUrls: string[];
  directDownloadUrl: string;
  filename: string;
  autoStart?: boolean;
  troubleHref: string;
};

export default function DownloadOwlFlow({
  version,
  fetchUrls,
  directDownloadUrl,
  filename,
  autoStart = false,
  troubleHref,
}: DownloadOwlFlowProps) {
  const [started, setStarted] = useState(autoStart);
  const [modalVisible, setModalVisible] = useState(autoStart);
  const [modalPhase, setModalPhase] = useState<ModalPhase>('downloading');
  const [progress, setProgress] = useState<ProgressSnapshot>(EMPTY_PROGRESS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedBlob, setSavedBlob] = useState<Blob | null>(null);
  const [viaBrowser, setViaBrowser] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
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

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !autoStart) return;
    startedRef.current = true;
    void runDownload(false);
  }, [autoStart, runDownload]);

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

  return (
    <div className="rf-dl-flow">
      {!started && (
        <DownloadOwlHero
          version={version}
          onDownload={() => runDownload(false)}
        />
      )}

      <DownloadProgressModal
        visible={modalVisible}
        logoSrc={LOGO_SRC}
        filename={filename}
        version={version}
        phase={modalPhase}
        progress={progress}
        errorMessage={errorMessage}
        viaBrowser={viaBrowser}
        onCancel={modalPhase === 'downloading' ? () => abortRef.current?.abort() : undefined}
        onRetry={modalPhase === 'error' ? () => runDownload(false) : undefined}
        onSaveAgain={modalPhase === 'complete' && savedBlob ? () => saveBlob(savedBlob, filename) : undefined}
        onDone={modalPhase === 'complete' ? () => { window.location.href = '/'; } : undefined}
        troubleHref={troubleHref}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
