// @ts-check
import { readFileSync, renameSync, rmdirSync } from 'node:fs';
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
  server: {
    port: 4321,
  },
  integrations: [
    react(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      filter: (page) => !page.includes('/m/'),
    }),
    {
      // Cloudflare Pages serves the nearest `404.html` up the path; Astro only flattens the root one.
      name: 'mobile-404',
      hooks: {
        'astro:build:done': ({ dir }) => {
          const mobileDir = join(fileURLToPath(dir), 'm');
          renameSync(join(mobileDir, '404', 'index.html'), join(mobileDir, '404.html'));
          rmdirSync(join(mobileDir, '404'));
        },
      },
    },
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
