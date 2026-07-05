import { useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import ContentRow from './components/ContentRow';
import SearchModal from './components/SearchModal';
import MovieDetails from './components/MovieDetails';
import { top10Movies, trendingMovies, onlyOnNetflix } from './data';
import { ArrowUp } from 'lucide-react';
import { Movie } from './types';

export default function App() {
  const [trendingTab, setTrendingTab] = useState('Recently Added');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [localCategory, setLocalCategory] = useState('Local Videos');

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#1d1613] text-[#d8cabb] font-sans overflow-x-hidden selection:bg-[#edd79c] selection:text-[#1c1512] pb-12">
      <Navbar onSearchClick={() => setIsSearchOpen(true)} />
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectMovie={(movie) => {
          setSelectedMovie(movie);
          setIsSearchOpen(false);
        }}
      />

      {selectedMovie && (
        <MovieDetails movie={selectedMovie} onBack={() => setSelectedMovie(null)} onSelectMovie={setSelectedMovie} />
      )}

      <main>
        <Hero onMovieSelect={setSelectedMovie} />

        <div className="relative z-20 -mt-24 space-y-10">
          <ContentRow
            title="Top 10"
            subtitle="Today"
            items={top10Movies}
            variant="poster"
            onMovieSelect={setSelectedMovie}
          />

          <ContentRow
            title="Video Library"
            subtitle="Recently Added"
            items={trendingMovies}
            variant="backdrop"
            tabs={['Recently Added', 'Continue Watching']}
            activeTab={trendingTab}
            onTabChange={setTrendingTab}
            onMovieSelect={setSelectedMovie}
          />

          <ContentRow
            title={localCategory}
            items={onlyOnNetflix}
            variant="backdrop"
            showDropdown={true}
            dropdownOptions={['Local Videos', 'Downloaded', 'Shared']}
            onDropdownChange={setLocalCategory}
            onMovieSelect={setSelectedMovie}
          />
        </div>
      </main>

      <button
        onClick={scrollToTop}
        className="fixed bottom-8 right-8 p-3 rounded-full bg-[#271c18] border border-[#edd79c]/20 text-[#edd79c] hover:text-[#1c1512] hover:bg-[#edd79c] transition-colors backdrop-blur-sm z-50"
      >
        <ArrowUp className="w-5 h-5" />
      </button>
    </div>
  );
}
