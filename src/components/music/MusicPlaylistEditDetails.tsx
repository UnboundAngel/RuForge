import { useEffect, useRef, useState } from "react";
import type { MediaFile } from "@/types";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import { PLAYLIST_DESCRIPTION_MAX } from "@/virtualPlaylists";
import { SettingsModalShell } from "@/components/settings/SettingsModalShell";
import { MusicPlaylistCover } from "./MusicPlaylistCover";

type Props = {
  open: boolean;
  title: string;
  description: string;
  tracks: MediaFile[];
  coverFile: MediaFile | null;
  /** Which field gets focus, so clicking the description lands in the description box. */
  focus: "title" | "description";
  onSave: (details: { title: string; description: string }) => void;
  onClose: () => void;
};

const FORM_ID = "rf-music-edit-details";

const FIELD =
  "w-full rounded-xl border border-transparent bg-white/[0.06] px-3.5 text-sm text-white placeholder:text-white/40 outline-none transition-colors hover:bg-white/[0.08] focus:border-white/[0.16] focus:bg-white/[0.1] caret-[#ff0033]";

/** Cover on the left, name and description on the right, in the same music popup as the delete confirm. */
export function MusicPlaylistEditDetails({
  open,
  title,
  description,
  tracks,
  coverFile,
  focus,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(title);
  const [desc, setDesc] = useState(description);
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(title);
    setDesc(description);
    const t = window.setTimeout(() => (focus === "description" ? descRef.current : nameRef.current)?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, title, description, focus]);

  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave({ title: name, description: desc });
    onClose();
  };

  return (
    <SettingsModalShell
      open={open}
      onClose={onClose}
      titleId="rf-music-edit-details-title"
      title="Edit details"
      eyebrow={null}
      theme="music"
      zIndexClass={OVERLAY_Z_CLASS.confirm}
      maxWidthClass="max-w-[520px]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-5 text-sm font-bold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={!canSave}
            className="h-10 rounded-full bg-[#ff0033] px-6 text-sm font-bold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
          >
            Save
          </button>
        </>
      }
    >
      <form
        id={FORM_ID}
        data-music-mode="true"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="flex gap-4"
      >
        <MusicPlaylistCover
          files={tracks}
          coverFile={coverFile}
          className="h-[156px] w-[156px] shrink-0"
          radius="12px"
          iconSize={48}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <input
            ref={nameRef}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add a name"
            aria-label="Name"
            className={`${FIELD} h-10 font-semibold`}
          />
          <textarea
            ref={descRef}
            value={desc}
            maxLength={PLAYLIST_DESCRIPTION_MAX}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Add an optional description"
            aria-label="Description"
            className={`${FIELD} flex-1 resize-none py-2.5 rf-scrollbar`}
          />
        </div>
      </form>
    </SettingsModalShell>
  );
}
