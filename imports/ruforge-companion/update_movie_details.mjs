import fs from 'fs';

let content = fs.readFileSync('src/components/MovieDetails.tsx', 'utf8');

content = content.replace(/bg-\[#0a0a0a\]/g, "bg-[#1d1613]");
content = content.replace(/from-\[#0a0a0a\]/g, "from-[#1d1613]");
content = content.replace(/bg-\[#141414\]/g, "bg-[#271c18]");
content = content.replace(/hover:bg-\[#202020\]/g, "hover:bg-[#322620]");
content = content.replace(/hover:bg-\[#1a1a1a\]/g, "hover:bg-[#261d18]");
content = content.replace(/text-gray-400/g, "text-[#9a8a7a]");
content = content.replace(/text-gray-500/g, "text-[#9a8a7a]");
content = content.replace(/text-white/g, "text-[#f5ede4]");
content = content.replace(/bg-white text-black/g, "bg-[#edd79c] text-[#1c1512]");
content = content.replace(/hover:bg-gray-200/g, "hover:bg-[#f5ede4]");

// Imports
content = content.replace(
  /import { ChevronLeft, VolumeX, Play, Plus, Download, Sparkles, Star } from 'lucide-react';/,
  `import { ChevronLeft, VolumeX, Play } from 'lucide-react';\nimport { handlePlay, handleUserAction } from '../integration';`
);

// Metadata replace
content = content.replace(
  /<div className="flex items-center space-x-6 text-sm text-\[#9a8a7a\] mb-6 font-medium">[\s\S]*?<\/div>\s*<\/div>/,
  `<div className="flex items-center space-x-6 text-sm text-[#c9b87a] mb-6 font-medium">
              <span>{movie.year}</span>
              <span>{movie.duration || '2h 10m'}</span>
              <span>{movie.container} \u00b7 {movie.resolution}</span>
              <span className="bg-[#261d18] px-2 py-0.5 rounded border border-[#edd79c]/20 text-[#edd79c] uppercase text-xs tracking-wider">{movie.status}</span>
            </div>`
);

// Play button handler
content = content.replace(
  /<button className="bg-\[#edd79c\] text-\[#1c1512\] px-6 py-2.5 rounded font-bold flex items-center space-x-2 hover:bg-\[#f5ede4\] transition-colors">/,
  `<button onClick={() => handlePlay(movie)} className="bg-[#edd79c] text-[#1c1512] px-6 py-2.5 rounded font-bold flex items-center space-x-2 hover:bg-[#f5ede4] transition-colors">`
);

// Volume button handler
content = content.replace(
  /<button className="w-10 h-10 bg-\[#271c18\] rounded flex items-center justify-center text-\[#f5ede4\] hover:bg-\[#322620\] transition-colors border border-white\/5">/,
  `<button onClick={handleUserAction} className="w-10 h-10 bg-[#271c18] rounded flex items-center justify-center text-[#f5ede4] hover:bg-[#322620] transition-colors border border-[#edd79c]/10">`
);

content = content.replace(
  /<button\s+onClick=\{onBack\}\s+className="w-10 h-10 bg-\[#271c18\] rounded flex items-center justify-center text-\[#f5ede4\] hover:bg-\[#322620\] transition-colors border border-white\/5"/,
  `<button onClick={onBack} className="w-10 h-10 bg-[#271c18] rounded flex items-center justify-center text-[#f5ede4] hover:bg-[#322620] transition-colors border border-[#edd79c]/10"`
);

// Actor replace text-white inside Actor loop
content = content.replace(/border-white\/5/g, "border-[#edd79c]/10");

// Similar loop metadata replace
content = content.replace(
  /<div className="flex items-center space-x-4 text-xs text-\[#9a8a7a\]">[\s\S]*?<\/div>\s*<\/div>/,
  `<div className="flex items-center space-x-4 text-xs text-[#9a8a7a]">
                      <span>{sim.year}</span>
                      <span>{sim.duration}</span>
                      <span className="truncate">{sim.type}</span>
                    </div>
                  </div>`
);


fs.writeFileSync('src/components/MovieDetails.tsx', content);
