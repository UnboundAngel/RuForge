import { useCallback, useState } from "react";

/**
 * Next up and Description/Comments share the right edge, so opening one closes the other. Doing it
 * in the setters covers every entry point (buttons, menu, shortcuts, edge hold, drag) at once.
 */
export function useExclusiveSidePanels() {
  const [showPlaylist, setPlaylist] = useState(false);
  const [commentsPanelOpen, setComments] = useState(false);

  const setShowPlaylist = useCallback((open: boolean) => {
    setPlaylist(open);
    if (open) setComments(false);
  }, []);
  const setCommentsPanelOpen = useCallback((open: boolean) => {
    setComments(open);
    if (open) setPlaylist(false);
  }, []);

  return { showPlaylist, setShowPlaylist, commentsPanelOpen, setCommentsPanelOpen };
}
