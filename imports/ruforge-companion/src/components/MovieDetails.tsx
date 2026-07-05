import { ChevronLeft, VolumeX, Play } from 'lucide-react';
import { handlePlay, handleUserAction } from '../integration';
import { Movie } from '../types';

interface MovieDetailsProps {
  movie: Movie;
  onBack: () => void;
  onSelectMovie?: (movie: Movie) => void;
}

export default function MovieDetails({ movie, onBack, onSelectMovie }: MovieDetailsProps) {
  return (
    <div className="fixed inset-0 z-[200] bg-[#1d1613] overflow-y-auto overflow-x-hidden hide-scrollbar">
      {/* Top Controls */}
      <div className="absolute top-8 left-8 z-10">
        <button onClick={onBack} className="w-10 h-10 bg-[#271c18] rounded flex items-center justify-center text-[#f5ede4] hover:bg-[#322620] transition-colors border border-[#edd79c]/10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>
      <div className="absolute top-8 right-8 z-10">
        <button onClick={handleUserAction} className="w-10 h-10 bg-[#271c18] rounded flex items-center justify-center text-[#f5ede4] hover:bg-[#322620] transition-colors border border-[#edd79c]/10">
          <VolumeX className="w-5 h-5" />
        </button>
      </div>

      {/* Hero Section */}
      <div className="relative h-[60vh] w-full">
        <div className="absolute inset-0">
          <img
            src={movie.backdropUrl || movie.imageUrl}
            alt={movie.title}
            className="w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1d1613] to-transparent" />
        </div>

        <div className="relative z-10 h-full flex flex-col justify-end px-8 md:px-12 pb-12 w-full max-w-7xl mx-auto">
          <div className="max-w-4xl">
            <h1 className="text-5xl md:text-6xl font-bold text-[#f5ede4] mb-4 tracking-tight">
              {movie.title}
            </h1>

            <div className="flex items-center space-x-6 text-sm text-[#c9b87a] mb-6 font-medium">
              <span>{movie.year}</span>
              <span>{movie.duration || '2h 10m'}</span>
              <span>{movie.container} · {movie.resolution}</span>
              <span className="bg-[#261d18] px-2 py-0.5 rounded border border-[#edd79c]/20 text-[#edd79c] uppercase text-xs tracking-wider">{movie.status}</span>
            </div>

            <p className="text-[#9a8a7a] text-sm md:text-base leading-relaxed mb-8 max-w-2xl">
              {movie.description}
            </p>

            <div className="flex items-center space-x-4">
              <button onClick={() => handlePlay(movie)} className="bg-[#edd79c] text-[#1c1512] px-6 py-2.5 rounded font-bold flex items-center space-x-2 hover:bg-[#f5ede4] transition-colors">
                <Play className="w-5 h-5 fill-current" />
                <span>Play</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="px-8 md:px-12 py-8 w-full max-w-7xl mx-auto">
        {movie.actors && movie.actors.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center space-x-3 mb-6">
              <h2 className="text-2xl font-bold text-[#f5ede4]">Actors</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {movie.actors.map(actor => (
                <div key={actor.id} className="flex items-center p-3 rounded-lg bg-[#271c18] border border-[#edd79c]/10 hover:bg-[#261d18] transition-colors cursor-pointer">
                  <img
                    src={actor.imageUrl}
                    alt={actor.name}
                    className="w-12 h-12 rounded-full object-cover shrink-0"
                  />
                  <div className="ml-4 overflow-hidden">
                    <h4 className="text-[#f5ede4] font-semibold text-sm truncate">{actor.name}</h4>
                    <p className="text-[#9a8a7a] text-xs mt-0.5 truncate">{actor.character}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {movie.similar && movie.similar.length > 0 && (
          <div>
            <div className="flex items-center space-x-3 mb-6">
              <h2 className="text-2xl font-bold text-[#f5ede4]">You may like</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {movie.similar.map(sim => (
                <div
                  key={sim.id}
                  className="group relative rounded-lg overflow-hidden cursor-pointer transition-transform duration-300 hover:scale-100 bg-[#271c18]"
                  onClick={() => onSelectMovie?.(sim)}
                >
                  <div className="aspect-video">
                    <img
                      src={sim.imageUrl}
                      alt={sim.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <h3 className="text-[#f5ede4] font-semibold text-sm truncate mb-1">{sim.title}</h3>
                    <div className="flex items-center space-x-4 text-xs text-[#9a8a7a]">
                      <span>{sim.year}</span>
                      <span>{sim.duration}</span>
                      <span className="truncate">{sim.type}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
