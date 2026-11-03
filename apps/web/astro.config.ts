import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { SITE } from './src/site.config.ts';

// The engine (TypeScript sources) is bundled into the build; HarfBuzz stays external so its WASM
// loads from node_modules, and so does MathJax, whose font loads extra glyph modules at run time
// that must share one copy of the font class. They and the label fonts are direct dependencies here.
const ENGINE = ['harfbuzzjs', '@mathjax/src', '@mathjax/mathjax-newcm-font'];

export default defineConfig({
  site: SITE.url,
  base: SITE.basePath,
  integrations: [svelte(), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    build: { sourcemap: false },
    ssr: { external: ENGINE },
    environments: { prerender: { resolve: { external: ENGINE } } },
    // Pre-bundling would move harfbuzz.js away from harfbuzz.wasm, which it loads relative to itself.
    optimizeDeps: { exclude: ENGINE },
  },
});
