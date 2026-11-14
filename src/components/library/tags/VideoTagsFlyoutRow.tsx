import { useMemo } from "react";
import { Tag, WandSparkles } from "lucide-react";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicMenuFlyoutRow,
  MusicMenuRow,
  MusicMenuSection,
} from "@/components/music/musicMenuUi";
import { createTag, tagVideo, untagVideo } from "@/lib/libraryTagsStore";
import type { MediaFile } from "@/types";
import { openTag } from "./openTag";
import { TagPicker } from "./TagPicker";
import { useVideoTags } from "./useVideoTags";

/** Card menu "Tags" row: the video's tags open beside the menu instead of replacing it. */
export function VideoTagsFlyoutRow({ file, onClose }: { file: MediaFile; onClose: () => void }) {
  return (
    <MusicMenuFlyoutRow
      tone={MUSIC_MENU_TONES.playlist}
      label="Tags"
      ariaLabel="Tags"
      icon={<Tag size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
      renderFlyout={(openedByClick) => (
        <VideoTagsPicker key={String(openedByClick)} file={file} onClose={onClose} autoFocus={openedByClick} />
      )}
    />
  );
}

/**
 * A video's own tags: checking adds a manual tag, unchecking takes it off for good. Each tag on the
 * video links to its page, where its auto-tag rules live.
 */
function VideoTagsPicker({ file, onClose, autoFocus }: { file: MediaFile; onClose: () => void; autoFocus: boolean }) {
  const tags = useVideoTags(file);
  const checked = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  return (
    <>
      <TagPicker
        autoFocus={autoFocus}
        checked={checked}
        onPick={(tag) => (checked.has(tag.id) ? untagVideo(file, tag.id) : tagVideo(file, tag.id))}
        onCreate={(name) => {
          const tag = createTag(name);
          if (tag) tagVideo(file, tag.id);
        }}
      />
      {tags.length ? (
        <MusicMenuSection label="Auto-tag" tone={MUSIC_MENU_TONES.navigate}>
          {tags.map((tag) => (
            <MusicMenuRow
              key={tag.id}
              tone={MUSIC_MENU_TONES.navigate}
              label={`Rules for ${tag.name}`}
              icon={<WandSparkles size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
              onClick={() => {
                onClose();
                openTag(tag.id);
              }}
            />
          ))}
        </MusicMenuSection>
      ) : null}
    </>
  );
}
