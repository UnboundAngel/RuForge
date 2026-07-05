import { Search, User, Play, Home, Settings, Folder, ChevronDown } from 'lucide-react';
import { handleNavigation, handleUserAction } from '../integration';

export default function Navbar({ onSearchClick }: { onSearchClick?: () => void }) {
  return (
    <nav className="fixed top-0 w-full z-50 flex items-center justify-between px-8 py-4 bg-gradient-to-b from-[#1c1512]/90 to-transparent">
      <div className="flex items-center space-x-2">
        <div className="bg-[#edd79c] p-2 rounded-full flex items-center justify-center">
          <Play fill="#1c1512" className="w-4 h-4 text-[#1c1512] ml-0.5" />
        </div>
        <span className="text-[#f5ede4] font-bold text-2xl tracking-tight">RuForge</span>
      </div>

      <div className="flex items-center space-x-8 text-sm font-medium text-[#c9b87a]">
        <button onClick={() => handleNavigation('home')} className="flex items-center space-x-1 hover:text-[#edd79c] transition-colors">
          <Home className="w-4 h-4" />
          <span>Home</span>
        </button>
        <button onClick={() => handleNavigation('config')} className="flex items-center space-x-1 hover:text-[#edd79c] transition-colors">
          <Settings className="w-4 h-4" />
          <span>Config</span>
        </button>
        <button onClick={() => handleNavigation('library')} className="flex items-center space-x-1 hover:text-[#edd79c] cursor-pointer transition-colors">
          <Folder className="w-4 h-4" />
          <span>Library</span>
          <ChevronDown className="w-3 h-3 ml-1" />
        </button>
      </div>

      <div className="flex items-center space-x-6 text-[#c9b87a]">
        <button className="hover:text-[#edd79c] transition-colors" onClick={onSearchClick}>
          <Search className="w-5 h-5" />
        </button>
        <button className="hover:text-[#edd79c] transition-colors" onClick={handleUserAction}>
          <User className="w-5 h-5" />
        </button>
      </div>
    </nav>
  );
}
