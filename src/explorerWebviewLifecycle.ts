/** Child webview label in the main window (`App.tsx`). */
export const EMBEDDED_EXPLORER_WEBVIEW_LABEL = "explorer-view";

/** Pause HTML5 / YouTube player media when leaving the Explorer tab. */
export const EXPLORER_PAUSE_MEDIA_SCRIPT = `(function(){try{document.querySelectorAll("video,audio").forEach(function(m){try{m.pause();}catch(e){}});var p=document.getElementById("movie_player");if(p&&typeof p.pauseVideo==="function")p.pauseVideo();}catch(e){}})();`;

export function explorerNavigateOrReloadScript(url: string): string {
  const encoded = JSON.stringify(url);
  return `(function(){try{var t=${encoded};if(location.href!==t)location.href=t;else location.reload();}catch(e){}})();`;
}
