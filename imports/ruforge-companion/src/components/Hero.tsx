import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Play, Info } from 'lucide-react';
import { handlePlay, handleMoreInfo } from '../integration';
import { motion, AnimatePresence, useMotionValue, useAnimation } from 'motion/react';
import { heroMovies } from '../data';
import { Movie } from '../types';

const HeroContent = ({ movie, onSeeMore }: { movie: Movie; onSeeMore?: (movie: Movie) => void }) => (
  <div className="w-full h-full relative">
    <img
      src={movie.imageUrl}
      alt={movie.title}
      className="w-full h-full object-cover pointer-events-none opacity-80"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-[#1d1613] to-transparent pointer-events-none" />
    <div className="absolute inset-0 z-10 flex flex-col justify-end items-center px-12 pb-16 pointer-events-none">
      <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight text-center">
        {movie.title}
      </h1>

      <div className="flex items-center space-x-6 text-sm text-[#c9b87a] mb-6 justify-center font-medium">
        <span>{movie.year}</span>
        <span>{movie.duration}</span>
        <span>{movie.container} · {movie.resolution}</span>
        <span className="bg-[#261d18] px-2 py-0.5 rounded border border-[#edd79c]/20 text-[#edd79c] uppercase text-xs tracking-wider">{movie.status}</span>
      </div>

      <p className="text-[#9a8a7a] text-sm md:text-base leading-relaxed mb-8 max-w-2xl text-center line-clamp-2">
        {movie.description}
      </p>

      <div className="flex items-center space-x-3 pointer-events-auto">
        <button onClick={() => handlePlay(movie)} className="bg-[#edd79c] text-[#1c1512] px-6 py-2.5 rounded font-semibold flex items-center space-x-2 hover:bg-[#f5ede4] transition-colors">
          <Play className="w-4 h-4 fill-current" />
          <span>Play</span>
        </button>
        <button
          onClick={() => {
            handleMoreInfo(movie);
            onSeeMore?.(movie);
          }}
          className="bg-[#271c18] text-[#f5ede4] px-6 py-2.5 rounded font-semibold flex items-center space-x-2 hover:bg-[#322620] transition-colors"
        >
          <span>More Info</span>
        </button>
      </div>
    </div>
  </div>
);

export default function Hero({ onMovieSelect }: { onMovieSelect?: (movie: Movie) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAuto, setIsAuto] = useState(true);
  const x = useMotionValue(0);
  const controls = useAnimation();
  const lastIndexRef = useRef(currentIndex);

  const prevIndex = (currentIndex - 1 + heroMovies.length) % heroMovies.length;
  const nextIndex = (currentIndex + 1) % heroMovies.length;

  useEffect(() => {
    if (isAuto) {
      const timer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % heroMovies.length);
      }, 6000);
      return () => clearInterval(timer);
    } else {
      // Pause auto-sliding temporarily during manual interaction, resume after 12 seconds
      const resumeTimer = setTimeout(() => {
        setIsAuto(true);
      }, 12000);
      return () => clearTimeout(resumeTimer);
    }
  }, [currentIndex, isAuto]);

  useLayoutEffect(() => {
    if (lastIndexRef.current !== currentIndex) {
      if (!isAuto) {
        x.set(0);
        controls.set({ x: 0 });
      }
      lastIndexRef.current = currentIndex;
    }
  }, [currentIndex, isAuto, x, controls]);

  const handleDragEnd = async (e: any, { offset }: any) => {
    setIsAuto(false);
    const swipe = offset.x;

    if (swipe < -50) {
      await controls.start({ x: "-100%", transition: { type: "spring", stiffness: 300, damping: 30 } });
      setCurrentIndex(nextIndex);
    } else if (swipe > 50) {
      await controls.start({ x: "100%", transition: { type: "spring", stiffness: 300, damping: 30 } });
      setCurrentIndex(prevIndex);
    } else {
      controls.start({ x: 0, transition: { type: "spring", stiffness: 300, damping: 30 } });
    }
  };

  return (
    <div className="relative h-[60vh] w-full overflow-hidden bg-[#1d1613]">
      <motion.div
        className="flex h-full w-full absolute left-0 cursor-grab active:cursor-grabbing"
        style={{ x }}
        animate={controls}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragStart={() => setIsAuto(false)}
        onDragEnd={handleDragEnd}
      >
        <div className="absolute w-full h-full" style={{ left: '-100%' }}>
          <HeroContent movie={heroMovies[prevIndex]} onSeeMore={onMovieSelect} />
        </div>

        <div className="absolute w-full h-full" style={{ left: '0%' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={currentIndex}
              initial={isAuto ? { opacity: 0 } : { opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={isAuto ? { opacity: 0 } : { opacity: 1 }}
              transition={{ duration: isAuto ? 0.8 : 0 }}
              className="absolute inset-0"
            >
              <HeroContent movie={heroMovies[currentIndex]} onSeeMore={onMovieSelect} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="absolute w-full h-full" style={{ left: '100%' }}>
          <HeroContent movie={heroMovies[nextIndex]} onSeeMore={onMovieSelect} />
        </div>
      </motion.div>

      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex space-x-2.5 z-30 pointer-events-auto">
        {heroMovies.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setIsAuto(false);
              setCurrentIndex(i);
            }}
            className={`h-1.5 rounded-full transition-all duration-500 hover:bg-white/60 ${i === currentIndex ? 'w-8 bg-[#edd79c]' : 'w-2 bg-white/30'}`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
