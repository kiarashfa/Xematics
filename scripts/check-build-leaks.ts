// Scans the production build for things that must never ship: source maps, references to
// private working files, local filesystem paths, third-party font hosts (fonts are self-hosted,
// so visitors' browsers never contact a font CDN), em-dashes, and words glued to links in HTML.

import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'apps', 'web', 'dist');

const FORBIDDEN: [RegExp, string][] = [
  [/\b(?:memory|spec|plan|CLAUDE|AGENTS)\.md\b/, 'private file name'],
  [/\.internal\//, 'private folder name'],
  [/sourceMappingURL/, 'source map reference'],
  [/[A-Za-z]:[\\/]Users[\\/]/, 'local Windows path'],
  [/\/home\/runner\//, 'CI runner path'],
  [/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net/, 'font CDN'],
];
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.xml', '.txt', '.svg']);

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const problems: string[] = [];
try {
  for await (const file of walk(DIST)) {
    const rel = relative(ROOT, file);
    if (file.endsWith('.map')) {
      problems.push(`${rel}: source map file`);
      continue;
    }
    if (!TEXT_EXT.has(extname(file))) continue;
    const text = await readFile(file, 'utf8');
    for (const [pattern, label] of FORBIDDEN) {
      if (pattern.test(text)) problems.push(`${rel}: ${label} (${pattern})`);
    }
    if (extname(file) === '.html' && text.includes('\u2014')) problems.push(`${rel}: em-dash`);
    if (extname(file) === '.html') {
      // Astro drops the space when a line ends right before a link ("the<a>"), gluing words.
      const prose = text.replace(/<(svg|script|style)\b[^]*?<\/\1>/g, '');
      for (const match of prose.matchAll(/[A-Za-z',;:]<a\s|<\/a>[A-Za-z]/g)) {
        const context = prose.slice(Math.max(0, match.index - 20), match.index + 20);
        problems.push(`${rel}: missing space around a link near "${context.replace(/\s+/g, ' ')}"`);
      }
    }
  }
} catch (error) {
  console.error(`Could not scan ${relative(ROOT, DIST)}. Run the build first.`, error);
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`Build output leaks:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('check:leaks passed.');
