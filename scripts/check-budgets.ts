// Performance budgets for the built site (apps/web/dist). For every page it follows the scripts
// the page loads up front (and their static imports) and the stylesheets it links, and checks
// their gzipped size. Heavy parts (MathJax, HarfBuzz, CJK font tables) must stay lazy.
// Run after the build: node scripts/check-budgets.ts

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const DIST = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const KB = 1024;

/** Gzipped bytes a page may load before any interaction. */
const BUDGETS = {
  toolScript: 165 * KB,
  /** The profile page: Svelte, the save format and cloud save; its previews load later. */
  userScript: 50 * KB,
  pageScript: 12 * KB,
  css: 40 * KB,
} as const;
/** No single lazy chunk may exceed this (raw), so nothing huge is bundled by accident. */
const MAX_CHUNK = 1.5 * KB * KB;
/**
 * Text that exists only inside code that must never load up front (names of lazily imported
 * modules do appear in the editor chunk, so these are pieces of the modules' own contents).
 */
const CJK_TABLE = readFileSync(
  new URL('../packages/core/src/text/catalog/cjk-sc.ts', import.meta.url),
  'utf8',
);
const LAZY_MARKERS = [
  'MissingCloseBrace', // MathJax's TeX parser
  'hb_buffer_create', // HarfBuzz
  /'([^']{40})/.exec(CJK_TABLE)![1]!, // the CJK font slice table
];

const failures: string[] = [];
const gz = (file: string) => gzipSync(readFileSync(file)).length;
const kb = (bytes: number) => `${(bytes / KB).toFixed(1)} KB`;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The initial script graph: entry scripts plus everything they import statically. */
function scriptGraph(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    // Static imports only: `import x from "./a.js"` and `import "./a.js"`, not import("./a.js").
    for (const match of code.matchAll(
      /(?:^|[;\s}])import\s*(?:[\w*{}\s,$]+?from\s*)?["'](\.\/[\w.-]+\.js)["']/g,
    )) {
      queue.push(join(file, '..', match[1]!));
    }
  }
  return [...seen];
}

const asset = (ref: string) => join(DIST, ref.replace(/^\/[^/]+\//, ''));
const files = walk(DIST);
const pages = files.filter((f) => f.endsWith('.html'));

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const name = relative(DIST, page).replaceAll('\\', '/');
  // Entry points: external scripts, and the component and renderer of each Astro island.
  const entries = [
    ...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g),
    ...html.matchAll(/(?:component|renderer)-url="([^"]+\.js)"/g),
  ].map((m) => asset(m[1]!));
  const graph = scriptGraph(entries);
  // Small scripts that Astro inlines into the page (not JSON-LD data blocks).
  const inline = [...html.matchAll(/<script(?![^>]*(?:src=|ld\+json))[^>]*>([^]*?)<\/script>/g)]
    .map((m) => m[1]!)
    .join('');
  const js = graph.reduce((sum, f) => sum + gz(f), 0) + (inline ? gzipSync(inline).length : 0);
  const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)]
    .map((m) => asset(m[1]!))
    .reduce((sum, f) => sum + gz(f), 0);
  const budget =
    name === 'tool/index.html'
      ? BUDGETS.toolScript
      : name === 'user/index.html'
        ? BUDGETS.userScript
        : BUDGETS.pageScript;
  console.log(
    `${name.padEnd(24)} js ${kb(js).padStart(9)} / ${kb(budget)}   css ${kb(css).padStart(8)} / ${kb(BUDGETS.css)}`,
  );
  if (js > budget) failures.push(`${name}: initial JavaScript ${kb(js)} is over ${kb(budget)}.`);
  if (css > BUDGETS.css) failures.push(`${name}: CSS ${kb(css)} is over ${kb(BUDGETS.css)}.`);
  for (const file of graph) {
    const code = readFileSync(file, 'utf8');
    for (const marker of LAZY_MARKERS) {
      if (code.includes(marker))
        failures.push(`${name}: ${relative(DIST, file)} loads ${marker} up front.`);
    }
  }
}

for (const file of files.filter((f) => f.endsWith('.js'))) {
  const size = statSync(file).size;
  if (size > MAX_CHUNK)
    failures.push(`${relative(DIST, file)} is ${kb(size)}, over ${kb(MAX_CHUNK)}.`);
}

if (failures.length > 0) {
  console.error(`\ncheck:budgets failed:\n${failures.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('check:budgets passed.');
