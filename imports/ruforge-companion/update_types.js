const fs = require('fs');

let content = fs.readFileSync('src/types.ts', 'utf8');

content = content.replace(/rating:\s*number;/g, "container?: string;\n  resolution?: string;\n  status?: 'local video' | 'in progress' | 'watched';");

fs.writeFileSync('src/types.ts', content);
