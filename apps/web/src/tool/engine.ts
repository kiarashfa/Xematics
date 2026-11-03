// Loads the text engine in the browser: the same font files and HarfBuzz build as in Node, so the
// preview and exports here are identical to the CLI and the build-time figures. Every font in the
// catalog is emitted as an asset, but a file is only fetched when a label needs it.

import { createTextEngine, type FontFile, type TextEngine } from '@xematics/core';
import subsetWasm from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url';

const FONT_URLS = import.meta.glob<string>(
  [
    '/node_modules/@fontsource/inter/files/inter-*-{400,500}-normal.woff',
    '/node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-{400,500}-normal.woff',
    '/node_modules/@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-{400,500}-normal.woff',
    '/node_modules/@fontsource/noto-sans-{sc,jp,kr}/files/noto-sans-{sc,jp,kr}-[0-9]*-{400,500}-normal.woff',
  ],
  { query: '?url', import: 'default', eager: true },
);

// MathJax loads glyph ranges outside its core set (bold, double-struck, ...) as modules.
const MATH_MODULES = import.meta.glob(
  '/node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic/*.js',
);
const MATH_PREFIX = '@mathjax/mathjax-newcm-font/js/svg/dynamic/';

async function fetchBytes(url: string, what: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${what} (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

let loading: Promise<TextEngine> | undefined;

export function loadEngine(): Promise<TextEngine> {
  loading ??= createTextEngine({
    loadFont: (font: FontFile) => {
      const url = FONT_URLS[`/node_modules/${font.package}/files/${font.file}`];
      if (!url) return Promise.reject(new Error(`No URL for bundled font ${font.file}.`));
      return fetchBytes(url, font.file);
    },
    importMath: (specifier) => {
      const name = specifier.startsWith(MATH_PREFIX) ? specifier.slice(MATH_PREFIX.length) : '';
      const load =
        MATH_MODULES[`/node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic/${name}`];
      return load ? load() : Promise.reject(new Error(`Unknown math module ${specifier}.`));
    },
    loadSubsetter: () => fetchBytes(subsetWasm, 'the font subsetter'),
  });
  return loading;
}
