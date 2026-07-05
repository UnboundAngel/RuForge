import fs from 'fs';

let content = fs.readFileSync('src/data.ts', 'utf8');

content = content.replace(/rating:\s*[\d\.]+,\s*/g, "container: 'MKV', resolution: '4K', status: 'local video', duration: '2h 10m', ");

content = content.replace(/'Movie'/g, "'Video'");
content = content.replace(/'TV Show'/g, "'Series'");
content = content.replace(/Trending Now/g, "Recently Added");
content = content.replace(/Top 10 Movies/g, "Top 10 Videos Today");

fs.writeFileSync('src/data.ts', content);
