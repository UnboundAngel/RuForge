import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";

export const CustomDropdown = ({ value, onChange, options }: { value: string, onChange: (v: string) => void, options: {value: string, label: string}[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || "Select Browser";

  return (
    <div className="relative w-full min-w-[200px]" ref={containerRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-12 bg-transparent border-b border-white/5 transition-all text-stone-400 text-xs font-black uppercase tracking-widest text-left flex items-center justify-between group outline-none"
      >
        <span className="group-hover:text-stone-100 transition-colors">{selectedLabel}</span>
        <ChevronDown className={`text-stone-700 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} size={14} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute top-full left-0 right-0 mt-2 bg-[#1C1917] border border-white/5 shadow-2xl z-50 overflow-hidden"
          >
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setIsOpen(false); }}
                  className={`w-full text-left px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b border-white/[0.02] last:border-0 ${
                    value === opt.value ? 'text-amber-500' : 'text-stone-500 hover:text-stone-100 hover:bg-white/[0.02]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
