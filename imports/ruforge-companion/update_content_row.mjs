import fs from 'fs';

let content = fs.readFileSync('src/components/ContentRow.tsx', 'utf8');

content = content.replace(/border-red-600/g, "border-[#edd79c]");
content = content.replace(/bg-red-600/g, "bg-[#edd79c]");
content = content.replace(/bg-\[#0a0a0a\]/g, "bg-[#1d1613]");
content = content.replace(/bg-\[#1a1a1a\]/g, "bg-[#271c18]");

fs.writeFileSync('src/components/ContentRow.tsx', content);
