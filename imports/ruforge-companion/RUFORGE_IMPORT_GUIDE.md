# RuForge Video Library Import Guide

## Files Changed and Responsibilities

- **`src/types.ts`**: Core typing (`Movie` which we treat as video entries, `Actor`). We replaced streaming metadata (`rating`) with local file metadata (`container`, `resolution`, `status`, `duration`).
- **`src/data.ts`**: Mock backend data utilizing the updated `Movie` interface.
- **`src/integration.ts`**: **Important** central file containing all mock/placeholder handlers (`handlePlay`, `handleMoreInfo`, `handleNavigation`, `handleUserAction`).
- **`src/App.tsx`**: The main page layout containing colors, typography, background updates, and mapping components to local data arrays.
- **`src/components/Navbar.tsx`**: Updated branding, icon changes, and click events routed directly to `src/integration.ts`.
- **`src/components/Hero.tsx`**: Updated visual layout (warm espresso/cream tones), removing star ratings in favor of file-based metadata, correctly capturing interaction events.
- **`src/components/ContentRow.tsx`**: Modified UI controls for rows (colors, styling, interactive tabs).
- **`src/components/MovieCard.tsx`**: Recolored badges to cream, removed ratings, updated textual data output.
- **`src/components/MovieDetails.tsx`**: Re-colored background, fixed interactions for playback, back arrow, volume toggle, and metadata rendering.
- **`src/components/SearchModal.tsx`**: Themed to RuForge colors and re-routed interactions to `src/integration.ts`.

## Components and Interactive Elements

1. **Navbar**
   - **Logo/Branding**: Plays logo animation, could be wired to home.
   - **Home, Config, Library**: Dropdown controls wired to `handleNavigation(string)`.
   - **Search Icon**: Toggles search modal open.
   - **User Icon**: Calls `handleUserAction`.

2. **Hero**
   - **Carousel Dots**: Switches featured item temporarily (auto-advances resume after 12s).
   - **Play Button**: Triggers `handlePlay(movie)`.
   - **More Info Button**: Triggers `handleMoreInfo(movie)`.

3. **ContentRow**
   - **Left/Right Scroll Arrows**: Manage standard scroll operations.
   - **Dropdown/Tabs**: Modifies active filter view or array.

4. **MovieCard**
   - **Top Badges**: Color adjusted.
   - **Card Click**: Expands `MovieDetails` overlay.

5. **MovieDetails**
   - **Back Button (Chevron)**: Closes modal (`onBack`).
   - **Volume Toggle**: Triggers `handleUserAction`.
   - **Play Button**: Triggers `handlePlay(movie)`.
   - **Similar Items**: Changes `selectedMovie`.

6. **SearchModal**
   - **"All Videos" dropdown**: Triggers `handleUserAction`.
   - **Close Modal (X)**: Clears query/state and collapses overlay.
   - **"Clear" Recent**: Empty handler `() => {}` inside code, could be wired if needed.
   - **Recent Click**: Populates search state.
   - **Row Click**: Expands detail accordion (`setExpandedId`).
   - **Play Button**: Triggers `handlePlay(movie)`.
   - **More Info**: Triggers `onSelectMovie`.

## Local State Variables

- **`trendingTab`**: Manages the visible array inside "Video Library" row ('Recently Added' vs 'Continue Watching').
- **`localCategory`**: Dropdown tracker for Local vs Shared rows ('Local Videos').
- **`isSearchOpen`**: Toggles visibility of `SearchModal`.
- **`selectedMovie`**: If set to a `Movie` object, it mounts the full-screen `MovieDetails` overlay.
- **`query`**: Input text value in SearchModal.
- **`expandedId`**: Tracks active accordion row in SearchModal results.
- **`currentIndex` / `isAuto`**: Hero carousel sliding index and temporary pause override mechanism.

## Import Process into RuForge

1. Replace `data.ts` mock data with your actual local file database connector (or API routes).
2. Rewrite the placeholders inside `integration.ts` to execute real RuForge client actions (e.g., launching an external player or redirecting paths).
3. If using Next.js/Remix, migrate component files, dropping React states where Server Components could fetch real video files natively.

## What Should NOT Be Imported

- **`src/data.ts`** and placeholder mock files should be ignored for production.
- Do not import the placeholder logic without wiring it up to your real backend controllers.
