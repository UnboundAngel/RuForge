# NeoTube Miniplayer Feature Plan

## The 10 Features
1. **Smart Transparency (Ghost Mode):** Allow the miniplayer to automatically drop to 20% opacity (or become fully translucent glass) when the mouse is outside the window, blending it seamlessly into the user's desktop background. It instantly snaps back to 100% opacity on hover or when a new video starts.
2. **Global Media Hotkeys:** Implement global keyboard shortcuts (e.g., `Alt + Space` for play/pause, `Alt + Arrow Keys` for next/previous) that control the miniplayer even when the user is actively typing in another application.
3. **Invisible "Micro" Progress Bar:** Replace the bulky default HTML5 video controls with a custom UI. Implement a 1px glowing line at the very bottom of the miniplayer representing playback progress. When hovered, it smoothly expands into a thicker, scrubbable timeline.
4. **Volume Scroll & Click-to-Mute:** Allow users to simply hover their mouse anywhere over the miniplayer and use their scroll wheel to adjust the volume, displaying a brief, stylized percentage indicator. A middle-click could instantly mute/unmute the audio.
5. **Always-on-Top Toggle (Pinning):** Add a sleek, animated "pin" icon to the header. When pinned, the miniplayer explicitly overrides other windows to stay visible. When unpinned, it acts like a normal window that can fall behind your main work.
6. **Seamless "Send to Main" Handoff:** Include a button that instantly closes the miniplayer and resumes the exact same video, at the exact same timestamp, in the main Neotube application's Theater mode.
7. **"Up Next" Queue Peek:** Instead of just showing the full library, modify the bottom slide-up strip to act as an "Up Next" queue. Users can drag and drop thumbnails within the strip to reorder what plays next without ever opening the main app.
8. **Double-Click to Theater:** Implement an interaction where double-clicking the video area instantly expands the miniplayer to fill the screen (or transitions it to the main app), and double-clicking again snaps it back down to its exact previous mini dimensions and position.
9. **Rich Metadata "Toasts" (Desktop Notifications):** When a new video starts playing, trigger a native OS desktop notification showing the title and an alert that it's playing.
10. **Borderless Magnetic Snapping:** Make the window "magnetic" to the edges of the user's monitor.

---

## Implementation Plan

### Phase 1: Core UX & Visuals (React/CSS focus)
*   **Target Features:** Smart Transparency (1), Volume Scroll (4), Double-Click to Theater (8).
*   **Action:** 
    *   Implement `onWheel` on the video container to map wheel delta to video volume. Add a brief UI overlay for volume percentage.
    *   Add `onDoubleClick` to trigger the "Send to Main" handoff logic (closing the mini window and emitting an event to the main window with the timestamp).
    *   Implement `onMouseEnter` / `onMouseLeave` on the root miniplayer wrapper to toggle an opacity class (`opacity-20` vs `opacity-100`).

### Phase 2: System Integration (Tauri API focus)
*   **Target Features:** Desktop Notifications (9), Always-on-Top Toggle (5).
*   **Action:**
    *   Integrate `@tauri-apps/plugin-notification` to send OS-level notifications when `playingFile` changes.
    *   Add a Pin icon to the header. Call `getCurrentWindow().setAlwaysOnTop(boolean)` to toggle the state.

### Phase 3: Advanced UI & Controls
*   **Target Features:** Custom Micro Progress Bar (3), Send to Main Handoff button (6).
*   **Action:**
    *   Hide the native HTML5 controls (`controls={false}`).
    *   Build a custom Framer Motion progress bar bound to the video's `onTimeUpdate` event.
    *   Add the "Return to Main" button in the header, capturing the `currentTime` of the video reference before closing.

### Phase 4: Complex State & OS Hooks
*   **Target Features:** Global Media Hotkeys (2), "Up Next" Queue (7), Magnetic Snapping (10).
*   **Action:**
    *   Register global shortcuts via `@tauri-apps/plugin-global-shortcut`.
    *   Implement drag-and-drop within the library strip using Framer Motion's `Reorder` component.
    *   Use Tauri's Window position APIs and screen dimensions to calculate snapping thresholds on drag end.

---

## Main Player & Gallery QoL Features
1. **Scrubber Thumbnail Previews (Hover-to-Peek):** Generate or extract a low-res sprite sheet when a video is downloaded, rendering a small preview image above the cursor when hovering over the scrubber.
2. **Double-Tap to Seek with Visual Feedback:** Implement invisible click zones on the left/right of the video. Double-clicking seeks backward/forward 10s and flashes a curved ripple animation.
3. **Theater Mode:** An intermediate state that expands the video player to fill the window width while keeping the app navigation available below.
4. **Persistent Preferences & State:** 
    *   Save user volume and playback speed settings automatically.
    *   Save playback position so users can resume exactly where they left off.
5. **Subtitles & Chapters:** Support loading external `.vtt` or `.srt` files downloaded via yt-dlp. Read video metadata to display vertical chapter markers on the scrubber.
6. **Keyboard Shortcuts Overlay:** A glassmorphic modal triggered by `?` to show all available player shortcuts (Play/Pause, Mute, Fullscreen, Seek, Loop, etc.).

### Phase 5: Main Player QoL & Persistence
*   **Target Features:** Persistent Preferences (4), Double-Tap to Seek (2), Keyboard Shortcuts Overlay (6).
*   **Action:**
    *   Use `localStorage` or Tauri's config APIs to store and read volume, speed, and last playback timestamp for each file.
    *   Add Framer Motion ripples to absolute positioned invisible divs on the left/right flanks of the player.
    *   Create a `<ShortcutsModal />` component activated by a global keyboard event listener.

### Phase 6: Advanced Media Processing
*   **Target Features:** Scrubber Thumbnail Previews (1), Theater Mode (3), Subtitles & Chapters (5).
*   **Action:**
    *   Call backend FFmpeg utilities to generate and cache thumbnail sprite sheets or use HTML5 canvas extraction.
    *   Modify the CSS grid/flex layout in `App.tsx` and `PlayerView.tsx` to handle the Theater Mode dimensions.
    *   Parse `.vtt` files and feed them to the `<track>` element in the video player.