import { motion, useReducedMotion } from "framer-motion";
import { Icon } from "@iconify/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight } from "lucide-react";
import type { MediaFile } from "@/types";
import type { ArtistAbout, ArtistLinkKind } from "@/lib/musicMeta";
import { formatListenDuration } from "./musicListenStats";
import { MusicArtistAboutTopTracks, type AboutTopTrack } from "./MusicArtistAboutTopTracks";

const LINK_META: Record<ArtistLinkKind, { icon: string; label: string }> = {
  instagram: { icon: "tabler:brand-instagram", label: "Instagram" },
  x: { icon: "tabler:brand-x", label: "X" },
  facebook: { icon: "tabler:brand-facebook", label: "Facebook" },
  youtube: { icon: "tabler:brand-youtube", label: "YouTube" },
  bandcamp: { icon: "simple-icons:bandcamp", label: "Bandcamp" },
  soundcloud: { icon: "tabler:brand-soundcloud", label: "SoundCloud" },
  tiktok: { icon: "tabler:brand-tiktok", label: "TikTok" },
  homepage: { icon: "tabler:world", label: "Website" },
};

type StatsProps = {
  playCount: number;
  listenTimeSec: number;
  songCount: number;
  topTracks: AboutTopTrack[];
  about: ArtistAbout | null;
  onPlayTrack?: (file: MediaFile) => void;
};

export function MusicArtistAboutStats({ playCount, listenTimeSec, songCount, topTracks, about, onPlayTrack }: StatsProps) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-7">
        <BigStat value={playCount.toLocaleString()} label={playCount === 1 ? "Play by you" : "Plays by you"} />
        {listenTimeSec >= 60 && <BigStat value={formatListenDuration(listenTimeSec)} label="Listened" />}
        <BigStat value={songCount.toLocaleString()} label={songCount === 1 ? "Song in your library" : "Songs in your library"} />
      </div>

      {topTracks.length > 0 && <MusicArtistAboutTopTracks tracks={topTracks} onPlay={onPlayTrack} />}

      {about && (about.links.length > 0 || about.wikipediaUrl || about.mbId) && (
        <div className="flex flex-col gap-0.5">
          {about.links.map((l) => (
            <LinkRow key={l.kind} url={l.url} icon={LINK_META[l.kind].icon} label={LINK_META[l.kind].label} />
          ))}
          {about.wikipediaUrl && <LinkRow url={about.wikipediaUrl} icon="tabler:brand-wikipedia" label="Wikipedia" />}
          <LinkRow url={`https://musicbrainz.org/artist/${about.mbId}`} icon="simple-icons:musicbrainz" label="MusicBrainz" />
        </div>
      )}
    </div>
  );
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[32px] font-extrabold leading-none tracking-tight text-white tabular-nums">{value}</p>
      <p className="mt-2 text-sm text-white/60">{label}</p>
    </div>
  );
}

function LinkRow({ url, icon, label }: { url: string; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void openUrl(url)}
      className="group/link -mx-2 flex h-9 items-center gap-3 rounded-lg px-2 text-left text-sm font-bold text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
    >
      <Icon icon={icon} width={18} height={18} aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      <ArrowUpRight size={14} className="opacity-0 transition-opacity group-hover/link:opacity-60" aria-hidden />
    </button>
  );
}

type BioProps = {
  name: string;
  about: ArtistAbout | null;
  loading: boolean;
  fallbackBlurb: string;
  onViewSongs?: () => void;
};

export function MusicArtistAboutBio({ name, about, loading, fallbackBlurb, onViewSongs }: BioProps) {
  const meta = [
    about?.artistType,
    about?.area,
    about?.beginYear ? (about.endYear ? `${about.beginYear} to ${about.endYear}` : `Since ${about.beginYear}`) : null,
  ].filter(Boolean);
  const bio = about?.bio ?? [];

  return (
    <div className="min-w-0">
      <h2 className="text-[32px] font-extrabold leading-none tracking-tight text-white">{name}</h2>
      {meta.length > 0 && <p className="mt-2 text-sm text-white/55">{meta.join(" · ")}</p>}

      <div className="mt-7 flex flex-col gap-5 text-[15px] leading-[1.7] text-white/80">
        {loading && bio.length === 0 ? (
          <BioSkeleton />
        ) : bio.length > 0 ? (
          bio.map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <p className="text-white/60">{fallbackBlurb || `No bio for ${name} on Wikipedia yet.`}</p>
        )}
      </div>

      {about && about.genres.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {about.genres.map((g) => (
            <span key={g} className="rounded-full bg-white/[0.08] px-3 py-1 text-xs font-medium capitalize text-white/80">
              {g}
            </span>
          ))}
        </div>
      )}

      {onViewSongs && (
        <button
          type="button"
          onClick={onViewSongs}
          className="rf-music-press mt-8 h-9 rounded-full bg-white/[0.08] px-4 text-[13px] font-bold text-white transition-colors hover:bg-white/[0.14]"
        >
          View songs in library
        </button>
      )}
    </div>
  );
}

function BioSkeleton() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="flex flex-col gap-2.5"
      animate={reduceMotion ? undefined : { opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      aria-label="Loading bio"
    >
      {[100, 94, 97, 60].map((w, i) => (
        <span key={i} className="h-3.5 rounded bg-white/[0.08]" style={{ width: `${w}%` }} />
      ))}
    </motion.div>
  );
}
