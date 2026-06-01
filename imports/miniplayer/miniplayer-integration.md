# Miniplayer Integration Guide

To integrate the `MusicPlayer` component as a floating miniplayer in your React application, follow these simple structural guidelines. This maintains the widget's polished proportions while placing it in the corner of your interface.

## Setting Up

Ensure `MusicPlayer` is either wrapped inside a persistent `Layout` component, placed directly inside `App.tsx`, or ported to ensure it persists out-of-bounds across routes without interrupting the user. 

### Fixed Floating Wrapper

You can wrap the provided widget in a CSS fixed block anchored to the bottom-right of the screen.

```tsx
import { MusicPlayer, type Track } from '@/components/ui/music-player-widget';

const sampleTracks: Track[] = [
  {
    title: "Very Long Track Name That Needs To Seamlessly Marquee Because It Exceeds The Base Width Edge",
    artist: "The Sample Band",
    cover: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=600&h=600",
    src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
  }
];

export function FloatingMiniplayer() {
  return (
    // Transform origin is set to bottom-right so any scaling shrinks it nicely towards the corner.
    <div className="fixed bottom-6 right-6 z-50 transform origin-bottom-right transition-transform hover:scale-105">
      <MusicPlayer tracks={sampleTracks} crossOrigin="anonymous" />
    </div>
  );
}
```

## Useful Modifications
- **Sizing:** The widget maintains a `400x515` strict pixel frame internally. To make it smaller for desktop miniplayers (e.g. effective size of `300px` base), utilize Tailwind scaling attributes on the wrapper wrapper directly: `scale-75`.
- **Text Marquee:** By default, text wider than `280px` smoothly fades at its left and right boundaries and infinitely marquees.
- **Elevation Layers:** Make sure to assign a z-index (e.g., `z-50` or higher) to avoid overlap issues with your main content layer.
