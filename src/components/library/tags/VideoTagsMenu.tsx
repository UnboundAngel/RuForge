import { useMemo } from "react";
import { WandSparkles } from "lucide-react";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  type MenuAt,
} from "@/components/music/musicMenuUi";
import { createTag, tagVideo, untagVideo } from "@/lib/libraryTagsStore";
import type { MediaFile } from "@/types";
import { openTag } from "./openTag";
import { TagPicker } from "./TagPicker";
import { useAllTags, useVideoTags } from "./useVideoTags";

/**
 * A video's own tags: checking adds a manual tag, unchecking takes it off for good. Each tag on the
 * video links to its page, where its auto-tag rules live.
 */
export function VideoTagsMenu({
  file,
  title,
  at,
  onClose,
}: {
  file: MediaFile;
  title: string;
  at: MenuAt | null;
  onClose: () => void;
}) {
  const tags = useVideoTags(file);
  const all = useAllTags();
  const checked = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  return (
    <MusicFloatingMenu
      open={at != null}
      x={at?.x ?? 0}
      y={at?.y ?? 0}
      placement={at?.placement}
      theme="library"
      onClose={onClose}
      ariaLabel={`Tags for ${title}`}
      measureKey={`${all.length}:${tags.length}`}
    >
      <TagPicker
        autoFocus
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
    </MusicFloatingMenu>
  );
}
