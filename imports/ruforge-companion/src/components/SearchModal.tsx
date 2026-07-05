import { Search, X, ChevronDown, Clock, Play, ChevronUp } from 'lucide-react';
import { handlePlay, handleUserAction } from '../integration';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { searchResultsMovies } from '../data';
import { Movie } from '../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMovie?: (movie: Movie) => void;
}

export default function SearchModal({ isOpen, onClose, onSelectMovie }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
      setTimeout(() => {
        setQuery('');
        setExpandedId(null);
      }, 300);
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-center pt-24 bg-[#1d1613]/90">
      <div className="absolute inset-0" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl px-4 z-10"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-[#f5ede4]">Search</h2>
          <div className="flex items-center space-x-3">
            <button onClick={handleUserAction} className="flex items-center space-x-2 bg-[#271c18] border border-[#edd79c]/10 rounded-md px-3 py-1.5 text-sm text-[#d8cabb] hover:text-[#f5ede4] hover:bg-[#322620] transition-colors">
              <span>All Videos</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 bg-[#271c18] border border-[#edd79c]/10 rounded-md text-[#9a8a7a] hover:text-[#f5ede4] hover:bg-[#322620] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9a8a7a]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type here to search..."
            className="w-full bg-[#1d1613] border border-[#edd79c]/10 rounded-xl py-4 pl-12 pr-12 text-[#f5ede4] placeholder-gray-500 focus:outline-none focus:border-white/20 transition-colors text-lg"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9a8a7a] hover:text-[#f5ede4]"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="bg-[#1d1613] border border-[#edd79c]/10 rounded-xl overflow-hidden shadow-2xl max-h-[60vh] overflow-y-auto hide-scrollbar">
          {!query ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4 px-2">
                <span className="text-xs font-semibold text-[#9a8a7a] uppercase tracking-wider">RECENT</span>
                <button onClick={() => {}} className="text-xs text-[#9a8a7a] hover:text-[#f5ede4] transition-colors">Clear</button>
              </div>
              <div className="space-y-1">
                {['Whiplash', 'whiplash', 'singer'].map((recent, idx) => (
                  <button
                    key={idx}
                    onClick={() => setQuery(recent)}
                    className="w-full flex items-center space-x-3 px-2 py-2.5 text-[#9a8a7a] hover:text-[#f5ede4] hover:bg-[#edd79c]/5 rounded-lg transition-colors text-sm"
                  >
                    <Clock className="w-4 h-4" />
                    <span>{recent}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {searchResultsMovies.map(movie => (
                <div key={movie.id} className="rounded-lg overflow-hidden border border-transparent hover:bg-[#edd79c]/5 transition-colors">
                  <button
                    onClick={() => setExpandedId(expandedId === movie.id ? null : movie.id)}
                    className="w-full flex items-center p-2 text-left"
                  >
                    <img
                      src={movie.imageUrl}
                      alt={movie.title}
                      className="w-12 h-16 object-cover rounded-md flex-shrink-0"
                    />
                    <div className="ml-4 flex-1">
                      <h4 className="text-[#f5ede4] font-semibold">{movie.title}</h4>
                      <div className="flex items-center text-xs text-[#9a8a7a] mt-1 space-x-4">
                        <span>{movie.type.split(' · ')[0]}</span>
                        <span>{movie.year}</span>
                        <span>{movie.duration}</span>
                        <span>{movie.type.split(' · ')[1]}</span>
                      </div>
                    </div>
                    <div className="px-4 text-[#9a8a7a]">
                      {expandedId === movie.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedId === movie.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-2 pb-4 pt-2">
                          <p className="text-sm text-[#d8cabb] leading-relaxed mb-4">
                            {movie.description || 'Description not available.'}
                          </p>
                          <div className="flex items-center space-x-3">
                            <button onClick={() => handlePlay(movie)} className="bg-[#edd79c] text-[#1c1512] px-5 py-2 rounded font-semibold flex items-center space-x-2 hover:bg-[#f5ede4] transition-colors text-sm">
                              <Play className="w-4 h-4 fill-current" />
                              <span>Play</span>
                            </button>
                            <button
                              onClick={() => onSelectMovie?.(movie)}
                              className="bg-[#271c18] border border-[#edd79c]/5 text-[#f5ede4] px-5 py-2 rounded font-semibold flex items-center space-x-2 hover:bg-[#322620] transition-colors text-sm"
                            >
                              <span>More Info</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
