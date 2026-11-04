// Credits come from THIRD_PARTY.md (component tables and a summary). The complete license texts
// are read from each shipped package's own license file at build time and published with the
// site as third-party-notices.txt, so they always match the installed versions.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import notices from '../../../THIRD_PARTY.md?raw';

export interface CreditTable {
  readonly title: string;
  readonly head: readonly string[];
  readonly rows: readonly (readonly Cell[])[];
}

export interface Cell {
  readonly text: string;
  /** Set when the cell is a Markdown autolink like <https://example.com>. */
  readonly href?: string;
}

/** Every table under a level-two heading. */
export function creditTables(): CreditTable[] {
  const tables: CreditTable[] = [];
  let title = '';
  let lines: string[] = [];
  const flush = () => {
    if (lines.length >= 3) {
      const [head, , ...body] = lines.map(splitRow);
      tables.push({ title, head: head!.map((c) => c.text), rows: body });
    }
    lines = [];
  };
  for (const line of notices.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      flush();
      title = line.slice(3).trim();
    } else if (line.startsWith('|')) lines.push(line);
    else flush();
  }
  flush();
  return tables;
}

/** The paragraphs under "Licenses in short", as plain text. */
export function licenseSummary(): string[] {
  const section = notices.split(/^## Licenses in short\s*$/m)[1] ?? '';
  return section
    .split(/\n\s*\n/)
    .map((p) => p.replace(/<(https?:\/\/[^>]+)>/g, '$1').trim())
    .filter((p) => p && !p.startsWith('#'));
}

function splitRow(line: string): Cell[] {
  return line
    .slice(1, -1)
    .split('|')
    .map((raw) => {
      const text = raw.trim();
      const link = /^<(https?:\/\/[^>]+)>$/.exec(text)?.[1];
      return link ? { text: link.replace(/^https?:\/\//, ''), href: link } : { text };
    });
}

/** Packages whose code or fonts ship in the website or in diagrams. */
const SHIPPED = [
  '@fontsource/inter',
  '@fontsource/vazirmatn',
  '@fontsource/noto-sans-hebrew',
  '@fontsource/noto-sans-sc',
  '@fontsource/noto-sans-jp',
  '@fontsource/noto-sans-kr',
  '@fontsource-variable/archivo',
  '@fontsource/ibm-plex-mono',
  '@fontsource/eb-garamond',
  '@mathjax/src',
  'bidi-js',
  'harfbuzzjs',
  'valibot',
  'yaml',
  'svelte',
] as const;

const ROOT = new URL('../../../', import.meta.url);
const requires = ['package.json', 'apps/web/package.json', 'packages/core/package.json'].map((p) =>
  createRequire(new URL(p, ROOT)),
);

/** A package's folder, also for packages whose exports hide package.json. */
function packageDir(name: string): string {
  for (const require of requires) {
    for (const entry of [`${name}/package.json`, name]) {
      try {
        let dir = dirname(require.resolve(entry));
        while (dir !== dirname(dir)) {
          const manifest = join(dir, 'package.json');
          if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) {
            return dir;
          }
          dir = dirname(dir);
        }
      } catch {
        // Try the next resolution base.
      }
    }
  }
  throw new Error(`Third-party notices: cannot find the package ${name}.`);
}

/** THIRD_PARTY.md followed by every shipped package's license file, verbatim. */
export function fullNotices(): string {
  const parts = [notices.trimEnd(), '', '# License texts', ''];
  for (const name of SHIPPED) {
    const dir = packageDir(name);
    const file = readdirSync(dir).find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
    if (!file) throw new Error(`Third-party notices: ${name} has no license file.`);
    const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      version: string;
    };
    const note = name === '@mathjax/src' ? ' (also covers @mathjax/mathjax-newcm-font)' : '';
    parts.push(
      `## ${name} ${version}${note}`,
      '',
      readFileSync(join(dir, file), 'utf8').trim(),
      '',
    );
  }
  return `${parts.join('\n')}\n`;
}
