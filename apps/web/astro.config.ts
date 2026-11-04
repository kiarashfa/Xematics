import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { SITE } from './src/site.config.ts';

// Cloud save ids (public by design) come from the repository's .env locally and from the
// repository variables in CI. Without them the build simply offers no cloud save.
const ENV_FILE = new URL('../../.env', import.meta.url);
const ROOT_ENV = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
for (const name of ['GOOGLE_CLIENT_ID', 'DROPBOX_APP_KEY']) {
  const value = process.env[name] || ROOT_ENV[name];
  if (value) process.env[`PUBLIC_${name}`] = value;
}

// The engine (TypeScript sources) is bundled into the build; HarfBuzz stays external so its WASM
// loads from node_modules, and so does MathJax, whose font loads extra glyph modules at run time
// that must share one copy of the font class. They and the label fonts are direct dependencies here.
const ENGINE = ['harfbuzzjs', '@mathjax/src', '@mathjax/mathjax-newcm-font'];

export default defineConfig({
  site: SITE.url,
  base: SITE.basePath,
  integrations: [svelte(), mdx(), sitemap()],
  // Plain code blocks: highlighters add inline styles, which the Content-Security-Policy blocks.
  markdown: { syntaxHighlight: false },
  // Content-Security-Policy as a <meta> tag on every page (GitHub Pages cannot send headers).
  // Astro adds hashes for its own scripts and styles. WebAssembly runs the text engine; Google
  // Analytics hosts are only used after the visitor accepts analytics. Google sign-in, Drive and
  // Dropbox are only contacted after the visitor connects a cloud save.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com",
        "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://accounts.google.com https://www.googleapis.com https://api.dropboxapi.com https://content.dropboxapi.com",
        'frame-src https://accounts.google.com',
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: [
          "'self'",
          "'wasm-unsafe-eval'",
          'https://www.googletagmanager.com',
          'https://accounts.google.com/gsi/client',
        ],
      },
      styleDirective: {
        resources: ["'self'", 'https://accounts.google.com/gsi/style'],
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: { sourcemap: false },
    ssr: { external: ENGINE },
    environments: { prerender: { resolve: { external: ENGINE } } },
    // Pre-bundling would move harfbuzz.js away from harfbuzz.wasm, which it loads relative to itself.
    optimizeDeps: { exclude: ENGINE },
  },
});
