import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import type { UpdaterPhase } from "@/components/UpdaterLayers";
import { loadDraftRelease, MOCK_POST_INSTALL_JSON, type DraftRelease } from "@/lib/releaseNotesPreview";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  buildPostInstallPayload,
  teaserNotesFromUpdaterBody,
  type PostInstallPayload,
} from "@/updatePostInstall";

type Setters = {
  setPostInstall: (p: PostInstallPayload) => void;
  setUpdaterPhase: Dispatch<SetStateAction<UpdaterPhase>>;
  setUpdaterIslandCollapsed: (v: boolean) => void;
  setUpdaterVersion: (v: string) => void;
  setSelectedUpdateReleaseVersion: (v: string) => void;
  setUpdaterNotes: (v: string) => void;
  setUpdaterContentLength: (v: number) => void;
  setUpdaterDownloaded: (v: number) => void;
};

const debugOn = () => useRuforgeStore.getState().settings.showDebuggingSettings === true;

/**
 * Settings > Debugging updater and What's New previews. The draft rows load
 * `docs/agents/release/notes-*.json` and exist in DEV only. Returns the draft's teaser so the
 * "ready to update" card shows it while the debug cycle sits on that phase.
 */
export function useDebugUpdaterPreview(s: Setters): string | null {
  const [draftNotes, setDraftNotes] = useState<string | null>(null);
  const draftRef = useRef<DraftRelease | null>(null);
  const setters = useRef(s);
  setters.current = s;

  useEffect(() => {
    const cycleUpdater = (draft: DraftRelease | null) => {
      if (!debugOn()) return;
      const x = setters.current;
      x.setUpdaterIslandCollapsed(false);
      x.setUpdaterPhase((current) => {
        if (current === "idle") {
          draftRef.current = draft;
          const v = draft?.version ?? "9.9.9";
          x.setUpdaterVersion(v);
          x.setSelectedUpdateReleaseVersion(v);
          setDraftNotes(draft ? teaserNotesFromUpdaterBody(draft.body) : null);
          x.setUpdaterNotes("### Mock Release Notes\n- Polished UI & Transitions\n- Enhanced accent color integration\n- Fixed subtitle ghosting bug\n- Improved MiniPlayer sizing logic");
          return "available";
        }
        if (current === "available") {
          x.setUpdaterContentLength(1000);
          x.setUpdaterDownloaded(450);
          return "downloading";
        }
        if (current === "downloading") return "installing";
        if (current === "installing") {
          const d = draftRef.current;
          x.setPostInstall(buildPostInstallPayload(d?.version ?? "9.9.9", d?.body ?? MOCK_POST_INSTALL_JSON));
          setDraftNotes(null);
        }
        return "idle";
      });
    };
    const unlisteners = [
      listen("debug-preview-whats-new", () => {
        if (!debugOn()) return;
        void getVersion().then((v) =>
          setters.current.setPostInstall(buildPostInstallPayload(v, MOCK_POST_INSTALL_JSON)),
        );
      }),
      listen("debug-cycle-updater", () => cycleUpdater(null)),
      listen("debug-preview-draft-whats-new", () => {
        if (!import.meta.env.DEV || !debugOn()) return;
        void loadDraftRelease().then((d) => {
          if (d) setters.current.setPostInstall(buildPostInstallPayload(d.version, d.body));
        });
      }),
      listen("debug-cycle-updater-draft", () => {
        if (!import.meta.env.DEV) return;
        void loadDraftRelease().then((d) => {
          if (d) cycleUpdater(d);
        });
      }),
    ];
    return () => unlisteners.forEach((u) => void u.then((f) => f()));
  }, []);

  return draftNotes;
}
