import { ChevronRight, ChevronLeft, ChevronDown } from 'lucide-react';
import { Movie } from '../types';
import MovieCard from './MovieCard';
import { useRef, useState, useEffect } from 'react';

interface ContentRowProps {
  title: string;
  subtitle?: string;
  items: Movie[];
  variant?: 'poster' | 'backdrop';
  tabs?: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  showDropdown?: boolean;
  dropdownOptions?: string[];
  onDropdownChange?: (option: string) => void;
  onMovieSelect?: (movie: Movie) => void;
}

export default function ContentRow({
  title,
  subtitle,
  items,
  variant = 'poster',
  tabs,
  activeTab,
  onTabChange,
  showDropdown,
  dropdownOptions,
  onDropdownChange,
  onMovieSelect
}: ContentRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10); // 10px tolerance
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth * 0.8 : scrollLeft + clientWidth * 0.8;

      scrollContainerRef.current.scrollTo({
        left: scrollTo,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    handleScroll();
  }, [items]);

  return (
    <div className="mb-12 relative px-12 group/row">
      <div className="flex items-end justify-between mb-6">
        <div className="flex items-center relative">
          <div
            className={`flex items-end space-x-3 ${showDropdown ? 'cursor-pointer group/title' : ''}`}
            onClick={() => showDropdown && setIsDropdownOpen(!isDropdownOpen)}
          >
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
              {title}
            </h2>
            {subtitle && (
              <span className="text-lg md:text-xl font-medium text-gray-400 mb-0.5">
                {subtitle}
              </span>
            )}
            {showDropdown && (
              <ChevronDown className={`w-6 h-6 ml-2 mb-1.5 text-gray-400 transition-transform group-hover/title:text-white ${isDropdownOpen ? 'rotate-180' : ''}`} />
            )}
          </div>

          {showDropdown && isDropdownOpen && dropdownOptions && (
            <div className="absolute top-full left-0 mt-3 w-64 bg-[#271c18] border border-white/5 rounded-lg shadow-2xl z-50 py-2 overflow-hidden">
              {dropdownOptions.map(option => (
                <button
                  key={option}
                  onClick={() => {
                    onDropdownChange?.(option);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left px-6 py-3 text-sm transition-all flex items-center justify-between ${
                    title === option
                      ? 'text-white font-bold bg-white/5'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        {tabs && (
          <div className="flex space-x-6 text-sm font-medium">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => onTabChange?.(tab)}
                className={`pb-1 border-b-2 transition-colors ${activeTab === tab ? 'text-white border-[#edd79c]' : 'text-gray-400 border-transparent hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute -left-6 top-[40%] -translate-y-1/2 z-10 p-2 bg-black/50 text-white rounded-full opacity-0 group-hover/row:opacity-100 hover:bg-black/80 hover:scale-110 transition-all backdrop-blur-sm"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 -mb-4"
        >
          {items.map(movie => (
            <MovieCard key={movie.id} movie={movie} variant={variant} onClick={onMovieSelect} />
          ))}
        </div>

        {showRightArrow && (
          <button
            onClick={() => scroll('right')}
            className="absolute -right-6 top-[40%] -translate-y-1/2 z-10 p-2 bg-black/50 text-white rounded-full opacity-0 group-hover/row:opacity-100 hover:bg-black/80 hover:scale-110 transition-all backdrop-blur-sm"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
