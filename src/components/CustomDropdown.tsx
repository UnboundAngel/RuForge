import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";

export const CustomDropdown = ({ value, onChange, options }: { value: string, onChange: (v: string) => void, options: {value: string, label: string}[] }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative w-full">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#2b1e19] rounded-full py-6 pl-16 pr-10 focus:outline-none transition-all text-amber-50 font-bold text-sm text-left shadow-inner flex items-center justify-between"
      >
        <span>{options.find(o => o.value === value)?.label || "Select Browser"}</span>
        <ChevronRight className={`text-amber-500/50 transition-transform ${isOpen ? "-rotate-90" : "rotate-90"}`} size={16} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-3 bg-[#2b1e19] rounded-[32px] overflow-hidden shadow-2xl z-50 p-2"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className="w-full text-left px-8 py-4 text-xs font-black uppercase tracking-widest text-amber-50/60 hover:text-amber-400 hover:bg-amber-500/10 transition-all rounded-2xl"
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
