// @ts-check
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { qrcode } from 'vite-plugin-qrcode';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const shippedVersion = JSON.parse(
  readFileSync(join(repoRoot, 'updater.json'), 'utf-8'),
).version;

// https://astro.build/config
export default defineConfig({
  site: 'https://ruforge.app',
  integrations: [
    react(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      filter: (page) => !page.includes('/m/'),
    }),
  ],
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(shippedVersion),
    },
    plugins: [tailwindcss(), qrcode()],
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
});
