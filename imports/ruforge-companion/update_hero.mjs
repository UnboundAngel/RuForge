import fs from 'fs';

let content = fs.readFileSync('src/components/Hero.tsx', 'utf8');

content = content.replace(/bg-\[#0a0a0a\]/g, "bg-[#1d1613]");
content = content.replace(/from-\[#0a0a0a\]/g, "from-[#1d1613]");
content = content.replace(/bg-red-600/g, "bg-[#edd79c]");
content = content.replace(/text-gray-400/g, "text-[#9a8a7a]");
content = content.replace(/bg-\[#2a2a2a\]/g, "bg-[#271c18]");
content = content.replace(/bg-\[#333333\]/g, "bg-[#322620]");

// Remove star and ratings, put metadata
// We had:
//        <div className="flex items-center text-white font-medium">
//          <Star className="w-4 h-4 mr-1 text-gray-400" />
//          <span>{movie.rating.toFixed(1)}</span>
//        </div>
content = content.replace(
  /<div className="flex items-center space-x-6 text-sm text-\[#9a8a7a\] mb-6 justify-center">[\s\S]*?<span>{movie.type}<\/span>\s*<\/div>/,
  `<div className="flex items-center space-x-6 text-sm text-[#c9b87a] mb-6 justify-center font-medium">
        <span>{movie.year}</span>
        <span>{movie.duration}</span>
        <span>{movie.container} \u00b7 {movie.resolution}</span>
        <span className="bg-[#261d18] px-2 py-0.5 rounded border border-[#edd79c]/20 text-[#edd79c] uppercase text-xs tracking-wider">{movie.status}</span>
      </div>`
);

// We need to add integration functions
content = content.replace(
  /import { Play, Info, Star } from 'lucide-react';/,
  `import { Play, Info } from 'lucide-react';\nimport { handlePlay, handleMoreInfo } from '../integration';`
);

content = content.replace(
  /<button className="bg-white text-black px-6 py-2.5 rounded font-semibold flex items-center space-x-2 hover:bg-gray-200 transition-colors">/g,
  `<button onClick={() => handlePlay(movie)} className="bg-[#edd79c] text-[#1c1512] px-6 py-2.5 rounded font-semibold flex items-center space-x-2 hover:bg-[#f5ede4] transition-colors">`
);

content = content.replace(
  /<button\s+onClick=\{\(\) => onSeeMore\?\.\(movie\)\}\s+className="bg-\[#271c18\] text-white px-6 py-2.5 rounded font-semibold flex items-center space-x-2 hover:bg-\[#322620\] transition-colors"\s*>\s*<span>More Info<\/span>\s*<\/button>/,
  `<button
          onClick={() => {
            handleMoreInfo(movie);
            onSeeMore?.(movie);
          }}
          className="bg-[#271c18] text-[#f5ede4] px-6 py-2.5 rounded font-semibold flex items-center space-x-2 hover:bg-[#322620] transition-colors"
        >
          <span>More Info</span>
        </button>`
);

fs.writeFileSync('src/components/Hero.tsx', content);
