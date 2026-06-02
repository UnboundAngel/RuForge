import { MusicPlayer, type Track } from './components/ui/music-player-widget';

const tracks: Track[] = [
  {
    title: 'Southern Roots Boogie',
    artist: 'Falconer',
    cover: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=600&h=600',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    title: 'Sax Party',
    artist: 'Ofer Koren',
    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=600&h=600',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    title: 'Nonsense',
    artist: 'Raw',
    cover: 'https://images.unsplash.com/photo-1493225457124-a1a2a5f560b2?auto=format&fit=crop&q=80&w=600&h=600',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
];

export default function App() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <MusicPlayer tracks={tracks} crossOrigin="anonymous" />
    </div>
  );
}
