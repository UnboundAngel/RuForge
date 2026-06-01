import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import type { Track, Layer } from './types';
import { useAudioPlayer, useKeyboardShortcuts } from './hooks';
import { ScalesMixer, Disc, TrackInfo, ProgressBar, Controls } from './components';

export * from './types';

export interface MusicPlayerProps {
  tracks: Track[];
  crossOrigin?: 'anonymous' | 'use-credentials';
}

export function MusicPlayer({ tracks, crossOrigin }: MusicPlayerProps) {
  const player = useAudioPlayer(tracks);
  const [isExpanded, setIsExpanded] = useState(false);

  const [layers, setLayers] = useState<Layer[]>(() => [
    { id: 0, track: tracks[0], dir: null },
  ]);
  const lastIndex = useRef(0);
  const idRef = useRef(1);

  useEffect(() => {
    if (player.state.currentIndex === lastIndex.current) return;
    lastIndex.current = player.state.currentIndex;
    const id = idRef.current++;
    setLayers((prev) => [
      ...prev,
      { id, track: player.currentTrack, dir: player.state.direction },
    ]);
    const t = setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.id === id));
    }, 760);
    return () => clearTimeout(t);
  }, [
    player.state.currentIndex,
    player.currentTrack,
    player.state.direction,
  ]);

  const seekForward = useCallback(() => {
    const a = player.audioRef.current;
    if (a) a.currentTime = Math.min(a.duration || 0, a.currentTime + 5);
  }, [player.audioRef]);
  const seekBackward = useCallback(() => {
    const a = player.audioRef.current;
    if (a) a.currentTime = Math.max(0, a.currentTime - 5);
  }, [player.audioRef]);

  const shortcuts = useMemo(
    () => ({
      toggle: player.toggle,
      next: player.next,
      prev: player.prev,
      seekForward,
      seekBackward,
      toggleShuffle: player.toggleShuffle,
      cycleLoop: player.cycleLoop,
    }),
    [
      player.toggle,
      player.next,
      player.prev,
      seekForward,
      seekBackward,
      player.toggleShuffle,
      player.cycleLoop,
    ]
  );
  useKeyboardShortcuts(shortcuts);

  return (
    <div className={cn("relative w-[400px] h-[515px] mx-auto bg-[#121212] rounded-[32px] flex flex-col shadow-2xl border border-white/5 overflow-hidden select-none transition-shadow hover:shadow-[0_24px_64px_rgba(0,0,0,0.8)]")}>
      <audio ref={player.audioRef} preload="metadata" crossOrigin={crossOrigin} />
      
      <div 
        className={cn(
          "absolute z-30 group cursor-pointer transition-all duration-[700ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
          isExpanded 
            ? "left-0 top-0 translate-x-0 translate-y-0 w-[400px] h-[515px] rounded-[32px]" 
            : "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-[190px]"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={cn(
          "w-full h-full transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          !isExpanded && "group-hover:translate-y-[24px]"
        )}>
          <Disc
            layers={layers}
            isPlaying={player.state.isPlaying}
            trackKey={player.state.currentIndex}
            direction={player.state.direction}
            isExpanded={isExpanded}
          />
        </div>
      </div>

      <div className="flex-1" />
      
      <div className={cn(
        "relative z-20 flex flex-col items-center w-full pb-8 transition-all duration-[500ms]",
        isExpanded ? "opacity-0 blur-md scale-95 pointer-events-none" : "opacity-100 blur-0 scale-100"
      )}>
        <div className="h-6 flex items-center justify-center mb-2">
          <ScalesMixer isPlaying={player.state.isPlaying} getFrequencyData={player.getFrequencyData} />
        </div>

        <TrackInfo layers={layers} />
        
        <ProgressBar currentTime={player.currentTime} duration={player.duration} onSeek={player.seek} />
        
        <Controls
          isPlaying={player.state.isPlaying}
          shuffled={player.state.shuffled}
          loopMode={player.state.loopMode}
          onToggle={player.toggle}
          onNext={player.next}
          onPrev={player.prev}
          onShuffle={player.toggleShuffle}
          onLoop={player.cycleLoop}
        />
      </div>
    </div>
  );
}

export default MusicPlayer;
