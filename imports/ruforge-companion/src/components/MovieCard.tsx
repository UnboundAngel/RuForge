import { Movie } from '../types';

interface MovieCardProps {
  movie: Movie;
  variant: 'poster' | 'backdrop';
  onClick?: (movie: Movie) => void;
}

export default function MovieCard({ movie, variant, onClick }: MovieCardProps) {
  const isPoster = variant === 'poster';

  return (
    <div
      className="flex-none cursor-pointer group flex flex-col"
      onClick={() => onClick?.(movie)}
    >
      <div className={`relative overflow-hidden rounded-md mb-2 ${isPoster ? 'w-[160px] sm:w-[200px] aspect-[2/3]' : 'w-[280px] sm:w-[320px] aspect-video'}`}>
        <img
          src={movie.imageUrl}
          alt={movie.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {movie.topRank && (
          <div className="absolute top-0 left-0 bg-[#edd79c] text-[#1c1512] text-[10px] font-bold px-2 py-1 rounded-br-md z-10 transition-colors group-hover:bg-[#f5ede4]">
            TOP<br/><span className="text-sm">{String(movie.topRank).padStart(2, '0')}</span>
          </div>
        )}
      </div>

      <h3 className="text-[#f5ede4] font-medium text-sm truncate w-full">{movie.title}</h3>

      <div className="flex items-center text-[11px] text-[#9a8a7a] mt-0.5 space-x-1.5">
        <span>{movie.year}</span>
        {movie.duration && (
          <>
            <span>&middot;</span>
            <span>{movie.duration}</span>
          </>
        )}
        <span>&middot;</span>
        <span>{movie.type}</span>
      </div>
    </div>
  );
}
