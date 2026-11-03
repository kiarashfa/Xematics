import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { SITE } from './src/site.config.ts';

// The engine (TypeScript sources) is bundled into the build; HarfBuzz stays external so its WASM
// loads from node_modules. harfbuzzjs and @fontsource/inter are therefore direct dependencies here.
const ENGINE = ['harfbuzzjs'];

export default defineConfig({
  site: SITE.url,
  base: SITE.basePath,
  integrations: [svelte(), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    build: { sourcemap: false },
    ssr: { external: ENGINE },
    environments: { prerender: { resolve: { external: ENGINE } } },
  },
});
