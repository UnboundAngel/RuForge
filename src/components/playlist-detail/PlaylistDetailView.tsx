import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { motionDuration, pageTransition } from "@/lib/overlayMotion";
import type { MediaFile, PlaylistCollection } from "@/types";
import { askConfirm } from "@/components/ConfirmDialog";
import { isVideoWatched } from "@/playbackStorage";
import { getDiskPlaylistMeta, isLinkedToDiskPlaylist, loadDiskPlaylistMeta } from "@/lib/diskPlaylistMeta";
import {
  playlistPlayFrom,
  playlistResume,
  playlistStartOver,
  removeWatchedFromPlaylist,
  usePlaylistSession,
} from "@/lib/playlistSession";
import { markPlaylistSeen } from "@/lib/playlistSeen";
import { addToQueue, playNext } from "@/lib/videoQueue";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isDemoPlaylistPath } from "@/lib/demoPlaylistPath";
import { useDemoPlaylistLeave, useDemoPlaylistView } from "@/lib/useOnboardingMockPlaylists";
import { getVirtualRecord, parseVirtualPlaylistId } from "@/virtualPlaylists";
import { consumeFreshPlaylist, dropFreshPlaylistIfEmpty, keepFreshPlaylist } from "@/lib/freshPlaylist";
import { playlistDisplayTitle } from "@/lib/playlistDisplayTitle";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { AddVideosGuide } from "./AddVideosGuide";
import { CoverFly, type FlyState } from "./CoverFly";
import { DetailHeader } from "./DetailHeader";
import { EnterRow } from "./EnterRow";
import { DEMO_NOTICE, demoRowHandlers } from "./demoRowHandlers";
import { useAddFly } from "./useAddFly";
import { linkToDiskPlaylist } from "@/lib/diskPlaylistMeta";
import { addedFromSuggested, reverseExits, type AddFly } from "./addFlyRegistry";
import { MissingRowItem } from "./MissingRowItem";
import { PlaylistColumnHeader } from "./PlaylistColumnHeader";
import { PlaylistVideoRow, type RowHandlers } from "./PlaylistVideoRow";
import { SuggestedPanel, type SuggestedHandle } from "./SuggestedPanel";
import {
  buildRows,
  rowTitle,
  sortRows,
  type FileRow,
  type PlaylistSortMode,
} from "./playlistRows";
import { usePlaylistActions } from "./usePlaylistActions";
import { RowDragGhost } from "./RowDragGhost";
import { useRowDrag } from "./useRowDrag";

export const PlaylistDetailView = ({
  playlist: shownPlaylist,
  onBack,
}: {
  playlist: PlaylistCollection;
  onBack: () => void;
}) => {
  const playlist = useDemoPlaylistView(shownPlaylist);
  const demo = isDemoPlaylistPath(playlist.path);
  useDemoPlaylistLeave(demo);
  const records = useRuforgeStore((s) => s.virtualPlaylistRecords);
  const scanRevision = useRuforgeStore((s) => s.libraryScanRevision);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const setVirtualPlaylistThumbnail = useRuforgeStore((s) => s.setVirtualPlaylistThumbnail);
  const refresh = useRuforgeStore((s) => s.refreshVirtualPlaylists);
  const notify = useRuforgeStore((s) => s.notify);

  const recordId = parseVirtualPlaylistId(playlist.path);
  const record = useMemo(
    () => (recordId ? getVirtualRecord(recordId, records) : undefined),
    [recordId, records],
  );
  const sessionId = playlist.path;
  const session = usePlaylistSession(sessionId);

  const [sortMode, setSortMode] = useState<PlaylistSortMode>("order");
  const [fresh] = useState(() => consumeFreshPlaylist(playlist.path));

  useEffect(() => {
    setSortMode("order");
  }, [playlist.path]);

  useEffect(() => {
    if (!fresh || !recordId) return;
    keepFreshPlaylist();
    return () => dropFreshPlaylistIfEmpty(recordId);
  }, [fresh, recordId]);

  useEffect(() => {
    if (demo) return;
    markPlaylistSeen(playlist.path);
    return () => markPlaylistSeen(playlist.path);
  }, [demo, playlist.path]);

  useEffect(() => {
    if (recordId || demo) return;
    void loadDiskPlaylistMeta([playlist.path]).then((found) => {
      if (found) refresh();
    });
  }, [demo, playlist.path, recordId, refresh]);

  const orderRows = useMemo(() => buildRows(playlist, record), [playlist, record]);
  const rows = useMemo(() => sortRows(orderRows, sortMode), [orderRows, sortMode]);
  const actions = usePlaylistActions(playlist, orderRows);

  // Watched marks live in localStorage, so a library refresh (which bulk marking triggers) re-reads them.
  const watchedKeys = useMemo(() => {
    void scanRevision;
    const set = new Set<string>();
    for (const r of rows) if (r.type === "file" && isVideoWatched(r.file.path, r.file.duration)) set.add(r.key);
    return set;
  }, [rows, scanRevision]);

  const listRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const scrollRef = listRef;

  const reduceMotion = useReducedMotion();
  const [fly, setFly] = useState<FlyState | null>(null);
  const canReorder = sortMode === "order";
  const keys = useMemo(() => rows.map((r) => r.key), [rows]);
  const drag = useRowDrag({
    enabled: canReorder,
    keys,
    scrollRef,
    coverRef,
    rowElement: (k) => rowEls.current.get(k) ?? null,
    onReorder: actions.reorder,
    onDropOnCover: (k, from) => {
      const file = fileRows.find((r) => r.key === k)?.file;
      const src = file?.thumbnailPath || file?.ruforgePosterPath;
      const el = coverRef.current;
      if (from && src && el && !reduceMotion) {
        // offsetWidth ignores the cover's armed scale, so the flight lands on its resting size.
        const c = el.getBoundingClientRect();
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        setFly({
          src,
          plate: true,
          from,
          to: { left: c.left + c.width / 2 - width / 2, top: c.top + c.height / 2 - height / 2, width, height },
        });
      }
      if (demo) {
        notify(DEMO_NOTICE);
        return;
      }
      actions.setStart(k);
      notify("Start video set");
    },
  });

  const playCover = () => {
    if (playlist.items.length === 0 || demo) return;
    if (session.started) playlistResume(sessionId);
    else playlistStartOver(sessionId);
  };

  const fileRows = useMemo(() => orderRows.filter((r): r is FileRow => r.type === "file"), [orderRows]);

  const startFile = session.startKey ? fileRows.find((r) => r.key === session.startKey)?.file : undefined;
  const startThumb = startFile?.thumbnailPath || startFile?.ruforgePosterPath || undefined;
  const ghostFile = drag.ghost ? fileRows.find((r) => r.key === drag.ghost?.key)?.file : undefined;

  const nextKey = session.started ? (session.currentKey ?? fileRows[0]?.key) : (session.startKey ?? fileRows[0]?.key);
  const nextFile = fileRows.find((r) => r.key === nextKey)?.file;
  const upNext = nextFile
    ? { label: session.started ? "Resume" : session.startKey ? "Starts with" : "Up first", title: rowTitle(nextFile.name), duration: formatDuration(nextFile.duration) }
    : null;

  const addFly = useAddFly(fileRows, rowEls, !reduceMotion);
  const addSuggested = useCallback(
    (file: MediaFile, from?: AddFly) => {
      if (demo) {
        notify(DEMO_NOTICE);
        return;
      }
      addFly.begin(from);
      if (recordId) addToVirtualPlaylist(recordId, [file.path]);
      else void linkToDiskPlaylist(playlist.path, [file.path]).then(refresh);
    },
    [addFly.begin, addToVirtualPlaylist, demo, notify, playlist.path, recordId, refresh],
  );
  const suggestedRef = useRef<SuggestedHandle>(null);
  // A row that came from Suggested goes back the way it came: text folds into the thumbnail, which flies to its old slot.
  const removeRow = useCallback(
    (row: Parameters<typeof actions.remove>[0]) => {
      const rec = row.type === "file" ? addedFromSuggested.get(row.key) : undefined;
      const rowEl = rowEls.current.get(row.key);
      const thumb = rowEl?.querySelector(".rf-art-clip");
      if (rec && rowEl && thumb && suggestedRef.current && !reduceMotion) {
        const t = thumb.getBoundingClientRect();
        reverseExits.set(row.key, { width: rowEl.offsetWidth, thumbRight: t.right - rowEl.getBoundingClientRect().left });
        suggestedRef.current.reverse({ ...rec, from: t });
      }
      if (row.type === "file") addedFromSuggested.delete(row.key);
      actions.remove(row);
    },
    [actions, reduceMotion],
  );
  const handlers = useMemo<RowHandlers>(
    () => demo ? demoRowHandlers(drag.onGripPointerDown, () => notify(DEMO_NOTICE)) : ({
      onPlay: (row) => playlistPlayFrom(sessionId, row.key),
      onPlayNext: (row) => playNext(row.file),
      onAddToQueue: (row) => addToQueue(row.file),
      onMoveTop: canReorder ? (row) => actions.moveTo(row, "top") : undefined,
      onMoveBottom: canReorder ? (row) => actions.moveTo(row, "bottom") : undefined,
      onSetStart: (row) => actions.setStart(row ? row.key : null),
      onSetCover: recordId ? (row) => {
        setVirtualPlaylistThumbnail(recordId, row.file.path);
        notify("Playlist thumbnail updated");
      } : undefined,
      onToggleWatched: (row, watched) => actions.setWatched([row.key], watched),
      onRemove: removeRow,
      onGrip: drag.onGripPointerDown,
    }),
    [actions, canReorder, demo, drag.onGripPointerDown, notify, recordId, removeRow, sessionId, setVirtualPlaylistThumbnail],
  );

  // Rows that mount after the first paint of this playlist are additions and open their slot.
  const settledFor = useRef<string | null>(null);
  const animateNewRows = settledFor.current === playlist.path;
  useEffect(() => {
    settledFor.current = playlist.path;
  }, [playlist.path]);

  // No longer shown or edited, but kept on save so older playlists do not lose theirs.
  const description = recordId
    ? (record?.description ?? "")
    : (getDiskPlaylistMeta(playlist.path)?.description ?? "");

  const removeWatched = async () => {
    const watched = fileRows.filter((r) => watchedKeys.has(r.key)).length;
    if (watched === 0) {
      notify("Nothing watched to remove");
      return;
    }
    const ok = await askConfirm({
      title: "Remove watched videos",
      message: `Remove ${watched} watched ${watched === 1 ? "video" : "videos"} from this playlist? The files stay in your library.`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
    });
    if (ok) await removeWatchedFromPlaylist(sessionId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={motionDuration(reduceMotion, pageTransition)}
      className="relative flex h-full flex-col overflow-hidden bg-[color:var(--rf-well)]"
    >

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[color:var(--rf-well)] rf-scrollbar">
    <DetailHeader
      ref={coverRef}
      playlist={playlist}
      sessionId={sessionId}
      started={session.started}
      isVideoPlaylist={Boolean(recordId)}
      coverArmed={drag.overCover}
      rowDragging={drag.dragKey != null}
      dragTitle={ghostFile ? rowTitle(ghostFile.name) : undefined}
      startThumb={startThumb}
      upNext={upNext}
      demo={demo}
      onBack={onBack}
      onPlayCover={playCover}
      renameOnMount={fresh}
      onRename={(title) => actions.saveDetails(title, description)}
      onMarkAll={(watched) => actions.setWatched(fileRows.map((r) => r.key), watched)}
      onRemoveWatched={() => void removeWatched()}
    />
        <div className="flex flex-1 flex-col px-4 pb-6 min-[900px]:px-8">
        <div className="@container relative z-10 flex w-full flex-1 flex-col">
          {rows.length ? <PlaylistColumnHeader mode={sortMode} onChange={setSortMode} /> : null}

          {rows.length === 0 && recordId ? (
            <AddVideosGuide title={playlistDisplayTitle(record?.title ?? playlist.title)} />
          ) : rows.length === 0 ? (
            <div className="space-y-2 py-24 text-left">
              <p className="text-sm font-medium text-stone-400">No videos in this folder</p>
              <p className="text-xs font-medium text-stone-600">Add video files to the folder and they show up here</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
            {rows.map((row, index) =>
              row.type === "file" ? (
                <EnterRow key={row.key} rowKey={row.key} animate={animateNewRows}>
                <PlaylistVideoRow
                  row={row}
                  index={index}
                  watched={watchedKeys.has(row.key)}
                  isStart={session.startKey === row.key}
                  canDrag={canReorder}
                  shift={drag.shiftOf(index, row.key)}
                  dragging={drag.dragKey === row.key}
                  settling={drag.settling}
                  dragActive={drag.dragKey != null}
                  removeLabel={recordId || isLinkedToDiskPlaylist(playlist.path, row.file.path) ? "Remove from playlist" : "Delete video"}
                  handlers={handlers}
                  locked={demo}
                  target={index === 0 ? "playlist-row-first" : undefined}
                  rowRef={(el) => {
                    if (el) rowEls.current.set(row.key, el);
                    else rowEls.current.delete(row.key);
                  }}
                />
                </EnterRow>
              ) : (
                <div
                  key={row.key}
                  ref={(el) => {
                    if (el) rowEls.current.set(row.key, el);
                    else rowEls.current.delete(row.key);
                  }}
                  style={{
                    transform: drag.shiftOf(index, row.key) ? `translateY(${drag.shiftOf(index, row.key)}px)` : undefined,
                    transition: drag.dragKey != null ? "transform 180ms cubic-bezier(0.16,1,0.3,1)" : "none",
                  }}
                >
                  <MissingRowItem
                    row={row}
                    canRelocate={Boolean(recordId)}
                    onRelocate={(r) => void actions.relocate(r)}
                    onRemove={removeRow}
                  />
                </div>
              ),
            )}
            </AnimatePresence>
          )}
        </div>
        <SuggestedPanel ref={suggestedRef} items={fileRows.map((r) => r.file)} targetId={recordId ?? playlist.path} onAdd={addSuggested} onDemoAction={demo ? () => notify(DEMO_NOTICE) : undefined} />
        </div>
      </div>
      {drag.ghost && ghostFile ? <RowDragGhost ghost={drag.ghost} file={ghostFile} /> : null}
      {fly ? <CoverFly fly={fly} onDone={() => setFly(null)} /> : null}
      {addFly.fly ? <CoverFly fly={addFly.fly} onDone={addFly.clear} /> : null}
    </motion.div>
  );
};
