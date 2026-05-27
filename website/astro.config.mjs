// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { qrcode } from 'vite-plugin-qrcode';

// https://astro.build/config
export default defineConfig({
  site: 'https://ruforge.app',
  integrations: [
    react(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  vite: {
    plugins: [tailwindcss(), qrcode()],
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
});
