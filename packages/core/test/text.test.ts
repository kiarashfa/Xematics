import { describe, expect, test } from 'vitest';
import { getEngine } from './helpers.ts';

const regular = { family: 'Inter', weight: 400 };
const medium = { family: 'Inter', weight: 500 };

describe('text engine', () => {
  // Reference widths measured with Chrome's canvas measureText on Inter. Matching them exactly
  // shows layout in Node agrees with browsers.
  test.each([
    ['AVATAR Hidden 1 To', regular, 124.06494140625],
    ['Hidden 1', regular, 52.93310546875],
    ['Input', regular, 31.07177734375],
    ['Output', regular, 41.7802734375],
    ['784', regular, 23.61328125],
    ['Hidden 1', medium, 53.345703125],
  ])('%s (%o) is as wide as in Chrome', async (text, font, width) => {
    const engine = await getEngine();
    expect(engine.shape(text, font, 13).width).toBe(width);
  });

  test('applies kerning', async () => {
    const engine = await getEngine();
    const pair = engine.shape('AV', regular, 100).width;
    const apart = engine.shape('A', regular, 100).width + engine.shape('V', regular, 100).width;
    expect(pair).toBeLessThan(apart);
  });

  test('falls back across subsets and reports missing characters', async () => {
    const engine = await getEngine();
    const text = 'σ(z) Ελλάδα';
    expect(engine.shape(text, regular, 13).pending.length).toBeGreaterThan(0);
    expect(await engine.load([{ text, font: regular }])).toBe(true);
    const greek = engine.shape(text, regular, 13);
    expect([greek.missing, greek.pending]).toEqual([[], []]);
    expect(new Set(greek.glyphs.map((g) => g.face)).size).toBe(2);
    expect(greek.glyphs.every((g) => g.glyph !== 0)).toBe(true);
    // No bundled font has these: Ethiopic.
    await engine.load([{ text: 'ሰላም', font: regular }]);
    expect(engine.shape('ሰላም', regular, 13).missing).toEqual(['ሰ', 'ላ', 'ም']);
  });

  test('picks the nearest weight and unknown families fall back to Inter', async () => {
    const engine = await getEngine();
    expect(engine.shape('Hidden 1', { family: 'Inter', weight: 700 }, 13).width).toBe(53.345703125);
    expect(engine.shape('Hidden 1', { family: 'Nope', weight: 400 }, 13).width).toBe(
      52.93310546875,
    );
  });

  test('outlines are positioned at the baseline origin', async () => {
    const engine = await getEngine();
    const shaped = engine.shape('H', regular, 13);
    const d = engine.outline(shaped, 100, 50);
    expect(d.startsWith('M')).toBe(true);
    const ys = [...d.matchAll(/-?\d+(?:\.\d+)?/g)]
      .map((m) => Number(m[0]))
      .filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeCloseTo(50, 1);
    expect(Math.min(...ys)).toBeGreaterThan(50 - shaped.ascent);
  });
});
