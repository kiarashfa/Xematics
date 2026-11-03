// Golden files: rendered output is deterministic, so any change to it is visible in review.
// After an intended visual change, refresh them with `pnpm test:update` and review the diff.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { formatDiagnostic, renderDiagram } from '../src/index.ts';
import { getEngine } from './helpers.ts';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const WITH_LIVE_TEXT = new Set(['mnist', 'named', 'persian', 'math']);

describe('golden SVG output', () => {
  test.each(readdirSync(FIXTURES).sort())('%s', async (file) => {
    const name = file.replace(/\.[^.]+$/, '');
    const source = readFileSync(new URL(file, FIXTURES), 'utf8');
    const engine = await getEngine();
    const result = await renderDiagram(source, engine);
    expect(
      result.diagnostics.filter((d) => d.severity === 'error').map((d) => formatDiagnostic(d)),
    ).toEqual([]);
    await expect(result.svg).toMatchFileSnapshot(`./golden/${name}.svg`);
    if (WITH_LIVE_TEXT.has(name)) {
      await expect((await renderDiagram(source, engine, { text: 'live' })).svg).toMatchFileSnapshot(
        `./golden/${name}.live.svg`,
      );
    }
  });
});
