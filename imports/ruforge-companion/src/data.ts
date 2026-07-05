import { Movie } from './types';

export const heroMovies: Movie[] = [
  {
    id: 'h1',
    title: 'OBSESSION',
    container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026,
    type: 'Horror \u00b7 Thriller',
    imageUrl: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=2070&auto=format&fit=crop',
    description: 'After breaking the mysterious "One Wish Willow" to win his crush\'s heart, a hopeless romantic finds himself getting exactly what he asked for but soon discovers that some desires come at a dark, sinister price.'
  },
  {
    id: 'h2',
    title: 'THE LAST VOYAGE',
    container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2025,
    type: 'Sci-Fi \u00b7 Adventure',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2070&auto=format&fit=crop',
    description: 'A crew of astronauts embarks on a multi-generational journey to a distant star system, only to uncover a terrifying secret hidden within their own ship\'s AI.'
  },
  {
    id: 'h3',
    title: 'ECHOES OF TOMORROW',
    container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026,
    type: 'Action \u00b7 Drama',
    imageUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2070&auto=format&fit=crop',
    description: 'In a world where memories can be extracted and sold, a rogue memory broker must go on the run when he accidentally downloads the consciousness of a murdered politician.'
  }
];

export const top10Movies: Movie[] = [
  { id: '1', title: 'Obsession', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=400&auto=format&fit=crop', topRank: 1 },
  { id: '2', title: 'Silo', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2023, type: 'Series', imageUrl: 'https://images.unsplash.com/photo-1574267432553-4b4628081c31?q=80&w=400&auto=format&fit=crop', topRank: 2 },
  { id: '3', title: 'Human Vapor', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Series', imageUrl: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?q=80&w=400&auto=format&fit=crop', topRank: 3 },
  { id: '4', title: 'Enola Holmes 3', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?q=80&w=400&auto=format&fit=crop', topRank: 4 },
  { id: '5', title: 'The Prosecutor\'s Proposal', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Series', imageUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=400&auto=format&fit=crop', topRank: 5 },
  { id: '6', title: 'Minions & Monsters', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?q=80&w=400&auto=format&fit=crop', topRank: 6 },
  { id: '7', title: 'Toy Story 5', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1610337673044-720471f83677?q=80&w=400&auto=format&fit=crop', topRank: 7 },
  { id: '8', title: 'The Last Voyage', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2025, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=400&auto=format&fit=crop', topRank: 8 },
  { id: '9', title: 'Echoes of Tomorrow', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=400&auto=format&fit=crop', topRank: 9 },
  { id: '10', title: 'Avatar: The Last Airbender', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2024, type: 'Series', imageUrl: 'https://images.unsplash.com/photo-1535016120720-40c746a6580c?q=80&w=400&auto=format&fit=crop', topRank: 10 },
];

export const trendingMovies: Movie[] = [
  { id: 't1', title: 'Obsession', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=800&auto=format&fit=crop' },
  { id: 't2', title: 'Enola Holmes 3', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=800&auto=format&fit=crop' },
  { id: 't3', title: 'The Devil Wears Prada 2', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1512413916942-870377c71d62?q=80&w=800&auto=format&fit=crop' },
  { id: 't4', title: 'Supergirl', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1608889175123-8ee362201f81?q=80&w=800&auto=format&fit=crop' },
  { id: 't5', title: 'Minions & Monsters', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1628155930542-3c7a64e2c833?q=80&w=800&auto=format&fit=crop' },
];

export const searchResultsMovies: Movie[] = [
  {
    id: 's1',
    title: 'WHIPLASH',
    container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2014,
    type: 'Movie \u00b7 Drama, Music',
    duration: '1h 47m',
    backdropUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?q=80&w=2070&auto=format&fit=crop',
    imageUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?q=80&w=400&auto=format&fit=crop',
    description: 'Under the direction of a ruthless instructor, a talented young drummer begins to pursue perfection at any cost, even his humanity.',
    genres: ['Drama', 'Music', 'Thriller'],
    actors: [
      { id: 'a1', name: 'Miles Teller', character: 'Andrew', imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=200&auto=format&fit=crop' },
      { id: 'a2', name: 'J.K. Simmons', character: 'Fletcher', imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop' },
      { id: 'a3', name: 'Paul Reiser', character: 'Jim', imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop' },
      { id: 'a4', name: 'Melissa Benoist', character: 'Nicole', imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop' },
      { id: 'a5', name: 'Austin Stowell', character: 'Ryan', imageUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=200&auto=format&fit=crop' },
      { id: 'a6', name: 'Nate Lang', character: 'Carl', imageUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop' }
    ],
    similar: [
      { id: 'sim1', title: 'Mo\' Better Blues', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 1990, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?q=80&w=400&auto=format&fit=crop' },
      { id: 'sim2', title: 'Class of 1984', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 1982, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=400&auto=format&fit=crop' },
      { id: 'sim3', title: 'Sound of Metal', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2020, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=400&auto=format&fit=crop' },
      { id: 'sim4', title: 'The Crush', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 1993, type: 'Video', imageUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=400&auto=format&fit=crop' }
    ]
  },
  { id: 's2', title: 'Whiplash', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 1961, type: 'TV Show \u00b7 Western, Drama', imageUrl: 'https://images.unsplash.com/photo-1533106958148-da0d0f507b99?q=80&w=400&auto=format&fit=crop' },
  { id: 's3', title: 'Whiplash', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2013, type: 'Movie \u00b7 Drama, Music', imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=400&auto=format&fit=crop' },
  { id: 's4', title: 'Whiplash', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 1948, type: 'Movie \u00b7 Drama', imageUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=400&auto=format&fit=crop' },
  { id: 's5', title: 'Whiplash', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 1974, type: 'Movie \u00b7 Action', imageUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=400&auto=format&fit=crop' },
  { id: 's6', title: 'Whiplash', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 1996, type: 'Movie \u00b7 Thriller', imageUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=400&auto=format&fit=crop' }
];

export const onlyOnNetflix: Movie[] = [
  { id: 'n1', title: 'Avatar: The Last Airbender', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2024, type: 'Series', imageUrl: 'https://images.unsplash.com/photo-1535016120720-40c746a6580c?q=80&w=800&auto=format&fit=crop' },
  { id: 'n2', title: 'Notes from the Last Row', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Series', imageUrl: 'https://images.unsplash.com/photo-1455390582262-044cdead27d8?q=80&w=800&auto=format&fit=crop' },
  { id: 'n3', title: 'Teach You a Lesson', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Series', imageUrl: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?q=80&w=800&auto=format&fit=crop' },
  { id: 'n4', title: 'The Polygamist', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Series', imageUrl: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?q=80&w=800&auto=format&fit=crop' },
  { id: 'n5', title: 'Sesame Street', container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', year: 2026, type: 'Series', imageUrl: 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?q=80&w=800&auto=format&fit=crop' },
];
