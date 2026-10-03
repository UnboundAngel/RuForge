// @ts-check
import { readFileSync, renameSync, rmdirSync, utimesSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { qrcode } from 'vite-plugin-qrcode';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const updaterPath = join(repoRoot, 'updater.json');
const shippedVersion = JSON.parse(readFileSync(updaterPath, 'utf-8')).version;

// Astro only reloads `__APP_VERSION__` when this config file changes, so a release would leave a running dev server on the old version.
function restartOnRelease() {
  const configPath = fileURLToPath(import.meta.url);
  return {
    name: 'ruforge-restart-on-release',
    configureServer(server) {
      server.watcher.add(updaterPath);
      server.watcher.on('change', (file) => {
        if (resolve(file) !== resolve(updaterPath)) return;
        const now = new Date();
        utimesSync(configPath, now, now);
      });
    },
  };
}

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
    plugins: [tailwindcss(), qrcode(), restartOnRelease()],
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
});
