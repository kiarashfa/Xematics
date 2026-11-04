// The site's link preview image (Open Graph, 1200 x 630), drawn at build time: the wordmark, the
// tagline as outlined Inter text, and a real figure. resvg rasterizes it; no fonts are needed.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { createNodeTextEngine } from '@xematics/core/node';
import type { APIRoute } from 'astro';
import wordmark from '../assets/wordmark.svg?raw';
import { figure } from '../figures.ts';

export const OG_SIZE = { width: 1200, height: 630 } as const;

const PAPER = '#f6f2ea';
const INK = '#1d1a16';
const MUTED = '#675f54';
const ACCENT = '#1f4e79';
const LINE = '#d3c9b8';

export const GET: APIRoute = async () => {
  const engine = await createNodeTextEngine();
  const text = (line: string, weight: number, size: number, x: number, y: number, fill: string) => {
    const shaped = engine.shape(line, { family: 'Inter', weight }, size);
    return `<path d="${engine.outline(shaped, x, y)}" fill="${fill}"/>`;
  };

  // The wordmark is themed with currentColor and a CSS variable; resvg needs plain colors.
  const mark = wordmark
    .replaceAll('var(--mark-accent, currentColor)', ACCENT)
    .replaceAll('currentColor', INK)
    .replace('<svg ', '<svg x="72" y="150" width="330" height="63" ');

  const diagram = (await figure('784-16-16-10', 'og-'))
    .replace(/ width="[\d.]+" height="[\d.]+"/, ' x="690" y="95" width="440" height="440"')
    .replace(/<title[^]*?<\/desc>/, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_SIZE.width}" height="${OG_SIZE.height}">
  <rect width="100%" height="100%" fill="${PAPER}"/>
  <rect x="660" y="65" width="500" height="500" fill="#ffffff" stroke="${LINE}"/>
  ${mark}
  ${text('Neural network figures,', 500, 44, 72, 300, INK)}
  ${text('typeset for print.', 500, 44, 72, 356, INK)}
  ${text('Free, private, in your browser.', 400, 26, 72, 420, MUTED)}
  <rect x="72" y="470" width="64" height="4" fill="${ACCENT}"/>
  ${diagram}
</svg>`;

  const require = createRequire(import.meta.url);
  await initWasm(await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
  const png = new Resvg(svg).render().asPng();
  return new Response(png as Uint8Array<ArrayBuffer>, { headers: { 'Content-Type': 'image/png' } });
};
