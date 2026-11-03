// Fails when an em-dash (U+2014) appears in public text: README, notices, site and package sources.
// The whole file is checked (comments included) so nothing slips through via UI strings in code.

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EM_DASH = '\u2014';
const ENTRIES = ['README.md', 'THIRD_PARTY.md', 'apps', 'packages', 'scripts', '.github'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.astro',
  'coverage',
  'playwright-report',
  'test-results',
]);
const TEXT_EXT = new Set([
  '.md',
  '.mdx',
  '.astro',
  '.svelte',
  '.ts',
  '.js',
  '.mjs',
  '.json',
  '.yaml',
  '.yml',
  '.css',
  '.html',
  '.svg',
  '.txt',
]);

async function* walk(path: string): AsyncGenerator<string> {
  const info = await stat(path).catch(() => null);
  if (!info) return;
  if (info.isFile()) {
    if (TEXT_EXT.has(extname(path))) yield path;
    return;
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    yield* walk(join(path, entry.name));
  }
}

const hits: string[] = [];
for (const entry of ENTRIES) {
  for await (const file of walk(join(ROOT, entry))) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      const col = line.indexOf(EM_DASH);
      if (col !== -1) hits.push(`${relative(ROOT, file)}:${i + 1}:${col + 1}`);
    });
  }
}

if (hits.length > 0) {
  console.error(`Em-dash (U+2014) found in public text:\n  ${hits.join('\n  ')}`);
  console.error('Use a comma, colon, parentheses or a hyphen instead.');
  process.exit(1);
}
console.log('check:text passed (no em-dashes).');
