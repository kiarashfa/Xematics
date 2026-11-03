// Compiles every TikZ golden file with LaTeX, so a change that breaks the TikZ export fails CI.
// Files that load fontspec (non-ASCII labels) use LuaLaTeX, the rest pdfLaTeX.
// Run: node scripts/check-tikz.ts          (set LATEX_BIN to a folder if LaTeX is not on PATH)

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GOLDEN = fileURLToPath(new URL('../packages/core/test/golden/', import.meta.url));
const bin = process.env['LATEX_BIN'];
const work = mkdtempSync(join(tmpdir(), 'xematics-tikz-'));
let failed = 0;

try {
  const files = readdirSync(GOLDEN).filter((f) => f.endsWith('.tex'));
  if (files.length === 0) throw new Error('No TikZ golden files found.');
  for (const file of files) {
    const engine = readFileSync(join(GOLDEN, file), 'utf8').includes('{fontspec}')
      ? 'lualatex'
      : 'pdflatex';
    copyFileSync(join(GOLDEN, file), join(work, file));
    const result = spawnSync(
      bin ? join(bin, engine) : engine,
      ['-interaction=nonstopmode', '-halt-on-error', file],
      { cwd: work, encoding: 'utf8' },
    );
    if (result.status === 0) {
      console.log(`ok    ${file} (${engine})`);
    } else {
      failed++;
      const error =
        result.error?.message ?? result.stdout.match(/^!.*(?:\n.*){0,3}/m)?.[0] ?? 'unknown error';
      console.log(`FAIL  ${file} (${engine})\n${error}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`check:tikz failed: ${failed} file(s) did not compile.`);
  process.exit(1);
}
console.log('check:tikz passed.');
