import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  getMainPlaybackBridge,
  subscribeMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import { useCurrentActivity } from "@/hooks/useCurrentActivity";
import { primaryArtist, rawArtistFromFile } from "@/components/music/musicArtist";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { ActivityIslandCard } from "./ActivityIslandCard";
import { ActivityIslandPill } from "./ActivityIslandPill";

const SPRING = { type: "spring" as const, stiffness: 400, damping: 30 };

export function ActivityIsland() {
  const activity = useCurrentActivity();
  const playback = useSyncExternalStore(
    subscribeMainPlaybackBridge,
    getMainPlaybackBridge,
    getMainPlaybackBridge,
  );
  const setActiveTab = useRuforgeStore((s) => s.setActiveTab);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!activity.showIsland) setExpanded(false);
  }, [activity.showIsland]);

  useEffect(() => {
    if (activity.renderState === "idle") setExpanded(false);
  }, [activity.renderState]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const handlePlayPause = useCallback(() => {
    if (activity.renderState === "main-video") {
      if (activity.hasLivePlayback && playback?.togglePlay) {
        playback.togglePlay();
        return;
      }
      setActiveTab("player");
      return;
    }
    if (activity.renderState === "main-music") {
      playback?.togglePlay?.();
      return;
    }
  }, [activity.renderState, activity.hasLivePlayback, playback, setActiveTab]);

  const title = activity.file?.name ?? "Unknown";
  const subtitle =
    activity.file && activity.renderState === "main-music"
      ? primaryArtist(rawArtistFromFile(activity.file)) || null
      : null;

  return (
    <>
      {expanded && activity.showIsland ? (
        <button
          type="button"
          className="pointer-events-auto fixed inset-0 z-[99] bg-transparent"
          aria-label="Dismiss now playing"
          onClick={() => setExpanded(false)}
        />
      ) : null}

      <div className="pointer-events-none fixed top-0 left-1/2 z-[100] flex h-10 -translate-x-1/2 items-center">
        <AnimatePresence mode="wait">
          {activity.showIsland ? (
            expanded ? (
              <motion.div
                key="card"
                layout
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -10 }}
                transition={SPRING}
              >
                <ActivityIslandCard
                  activity={activity}
                  accentColor={activity.accentColor}
                  title={title}
                  subtitle={subtitle}
                  showSkip={activity.renderState === "main-music"}
                  hasPrevInQueue={playback?.hasPrevInQueue ?? false}
                  hasNextInQueue={playback?.hasNextInQueue ?? false}
                  onPlayPause={handlePlayPause}
                  onSkipPrev={playback?.skipPrev}
                  onSkipNext={playback?.skipNext}
                  onClose={() => setExpanded(false)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="pill"
                layout
                initial={{ opacity: 0, scale: 0.92, y: -15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -15 }}
                transition={SPRING}
              >
                <ActivityIslandPill
                  coverSrc={activity.coverSrc}
                  title={title}
                  paused={activity.paused}
                  accentColor={activity.accentColor}
                  isStub={activity.isStub}
                  onClick={() => setExpanded(true)}
                />
              </motion.div>
            )
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}
