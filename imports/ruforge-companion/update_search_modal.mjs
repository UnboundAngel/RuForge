import fs from 'fs';

let content = fs.readFileSync('src/components/SearchModal.tsx', 'utf8');

// Colors
content = content.replace(/bg-\[#0a0a0a\]\/90/g, "bg-[#1d1613]/90");
content = content.replace(/bg-\[#0a0a0a\]/g, "bg-[#1d1613]");
content = content.replace(/bg-\[#141414\]/g, "bg-[#271c18]");
content = content.replace(/bg-\[#1f1f1f\]/g, "bg-[#322620]");
content = content.replace(/bg-\[#2a2a2a\]/g, "bg-[#271c18]");
content = content.replace(/bg-\[#333333\]/g, "bg-[#322620]");

content = content.replace(/text-white/g, "text-[#f5ede4]");
content = content.replace(/text-gray-300/g, "text-[#d8cabb]");
content = content.replace(/text-gray-400/g, "text-[#9a8a7a]");
content = content.replace(/text-gray-500/g, "text-[#9a8a7a]");
content = content.replace(/border-white\/10/g, "border-[#edd79c]/10");
content = content.replace(/border-white\/5/g, "border-[#edd79c]/5");
content = content.replace(/bg-white\/5/g, "bg-[#edd79c]/5");

content = content.replace(/bg-white text-black/g, "bg-[#edd79c] text-[#1c1512]");
content = content.replace(/hover:bg-gray-200/g, "hover:bg-[#f5ede4]");
content = content.replace(/hover:text-white/g, "hover:text-[#f5ede4]");

// Icons
content = content.replace(
  /import { Search, X, ChevronDown, Clock, Star, Play, Info, ChevronUp } from 'lucide-react';/,
  `import { Search, X, ChevronDown, Clock, Play, ChevronUp } from 'lucide-react';\nimport { handlePlay, handleUserAction } from '../integration';`
);

// Metadata replace
content = content.replace(
  /<div className="flex items-center text-xs text-\[#9a8a7a\] mt-1 space-x-4">[\s\S]*?<\/div>\s*<\/div>/,
  `<div className="flex items-center text-xs text-[#9a8a7a] mt-1 space-x-4">
                        <span>{movie.type.split(' \u00b7 ')[0]}</span>
                        <span>{movie.year}</span>
                        <span>{movie.duration}</span>
                        <span>{movie.type.split(' \u00b7 ')[1]}</span>
                      </div>
                    </div>`
);

// Search header buttons
content = content.replace(
  /<span>Movies & TV Shows<\/span>/,
  `<span>All Videos</span>`
);
content = content.replace(
  /<button className="flex items-center space-x-2 bg-\[#271c18\] border border-\[#edd79c\]\/10 rounded-md px-3 py-1\.5 text-sm text-\[#d8cabb\] hover:text-\[#f5ede4\] hover:bg-\[#322620\] transition-colors">/,
  `<button onClick={handleUserAction} className="flex items-center space-x-2 bg-[#271c18] border border-[#edd79c]/10 rounded-md px-3 py-1.5 text-sm text-[#d8cabb] hover:text-[#f5ede4] hover:bg-[#322620] transition-colors">`
);

content = content.replace(
  /<button className="text-xs text-\[#9a8a7a\] hover:text-\[#f5ede4\] transition-colors">Clear<\/button>/,
  `<button onClick={() => {}} className="text-xs text-[#9a8a7a] hover:text-[#f5ede4] transition-colors">Clear</button>`
);

// handlers
content = content.replace(
  /<button className="bg-\[#edd79c\] text-\[#1c1512\] px-5 py-2 rounded font-semibold flex items-center space-x-2 hover:bg-\[#f5ede4\] transition-colors text-sm">/g,
  `<button onClick={() => handlePlay(movie)} className="bg-[#edd79c] text-[#1c1512] px-5 py-2 rounded font-semibold flex items-center space-x-2 hover:bg-[#f5ede4] transition-colors text-sm">`
);


fs.writeFileSync('src/components/SearchModal.tsx', content);
