export interface TutorialStepContent {
  title: string;
  description: string;
}

export interface TutorialHubContent {
  id: string;
  eyebrow: string;
  steps: [TutorialStepContent, TutorialStepContent, TutorialStepContent];
}

export const tutorialHubsContent: TutorialHubContent[] = [
  {
    id: 'download',
    eyebrow: 'How downloading works',
    steps: [
      {
        title: 'Paste the link',
        description:
          'Drop a YouTube URL into the downloader. RuForge reads title, duration, and format options immediately.',
      },
      {
        title: 'Confirm and enqueue',
        description:
          'Pick quality or audio-only, then start the job. Explorer cookie sync still applies when you need it.',
      },
      {
        title: 'Track the queue',
        description:
          'Follow progress, speed, and ETA in the floating queue. Finished files land in your library when done.',
      },
    ],
  },
  {
    id: 'library',
    eyebrow: 'Media Library',
    steps: [
      {
        title: 'Browse your catalog',
        description:
          'Scan folders, filter by type, and see watch progress on every card. Your library stays on disk with no account sync.',
      },
      {
        title: 'Playlists on shuffle',
        description:
          'Open a playlist and play through it at random. RuForge keeps queue order local so you can binge without leaving the app.',
      },
      {
        title: 'Delete with confidence',
        description:
          'Remove files from disk and the index together. In-flight preview jobs cancel so deletes never block the UI.',
      },
    ],
  },
  {
    id: 'player',
    eyebrow: 'Media Player',
    steps: [
      {
        title: 'Scrub to any moment',
        description:
          'Drag the seeker or hover the chapter bar to jump. Thumbnail previews line up with the playhead so you land on the right frame.',
      },
      {
        title: 'Watch without flash',
        description:
          'Hardware-friendly playback with keyboard shortcuts, volume, and loop. The player is built for files you already own.',
      },
      {
        title: 'See what plays next',
        description:
          'Folder queue and library order show the next file before you skip. Auto-advance respects your playback settings.',
      },
    ],
  },
  {
    id: 'sponsor',
    eyebrow: 'SponsorBlock',
    steps: [
      {
        title: 'Skip in one tap',
        description:
          'When a segment starts, hit the skip control in the corner. RuForge learns your preferences per category over time.',
      },
      {
        title: 'Segments on the bar',
        description:
          'Sponsor ranges and chapters paint on the scrubber with extension-aligned colors. A SponsorBlock strip sits under the timeline.',
      },
      {
        title: 'Tune what gets skipped',
        description:
          'Open Playback settings to toggle categories, intros, and music-offtopic. Hashes stay local; nothing leaves your machine.',
      },
    ],
  },
  {
    id: 'mini',
    eyebrow: 'Mini Player',
    steps: [
      {
        title: 'Pop out from the title bar',
        description:
          'Use the mini player control in the top-right chrome to detach playback into a borderless corner window.',
      },
      {
        title: 'Large mode with library strip',
        description:
          'Resize to the comfortable large layout and pick the next file from the bottom media row without returning to the main window.',
      },
      {
        title: 'Shrink out of the way',
        description:
          'Drop to the smallest height for a marquee title and tight controls. Stays readable while staying off your workspace.',
      },
    ],
  },
  {
    id: 'settings',
    eyebrow: 'Advanced Settings',
    steps: [
      {
        title: 'General preferences',
        description:
          'Set theme, accent, paths, and startup behavior. Everything persists locally for the main and mini windows.',
      },
      {
        title: 'Download behavior',
        description:
          'Parallel jobs, output folders, cookie sync, and automatic scrubber previews. Match yt-dlp options to how you archive.',
      },
      {
        title: 'Playback controls',
        description:
          'Auto-advance, prefetch, SponsorBlock tree, and ReplayGain placeholders live together under Playback.',
      },
    ],
  },
];
