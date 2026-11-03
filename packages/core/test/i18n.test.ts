import { describe, expect, test } from 'vitest';
import {
  joinMath,
  layoutModel,
  nodeLabelText,
  parseModel,
  prepareModel,
  splitMath,
  type CircleItem,
  type MathItem,
  type Model,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

const medium = { family: 'Inter', weight: 500 };

function model(text: string): Model {
  const parsed = parseModel(text);
  if (!parsed.model) throw new Error(parsed.diagnostics.map((d) => d.message).join('\n'));
  return parsed.model;
}

async function layout(text: string) {
  const engine = await getEngine();
  const m = model(text);
  await prepareModel(m, engine);
  return layoutModel(m, engine);
}

describe('math in labels', () => {
  test('splits $...$ from text; \\$ and unmatched $ stay literal', () => {
    expect(splitMath('Hidden $h^{(1)}$ costs \\$5')).toEqual([
      { kind: 'text', text: 'Hidden ' },
      { kind: 'math', tex: 'h^{(1)}' },
      { kind: 'text', text: ' costs $5' },
    ]);
    expect(splitMath('a $b')).toEqual([{ kind: 'text', text: 'a $b' }]);
    expect(splitMath('$$')).toEqual([{ kind: 'text', text: '$$' }]);
    expect(splitMath('$a\\$b$')).toEqual([{ kind: 'math', tex: 'a\\$b' }]);
    const source = 'x $\\alpha$ costs \\$3';
    expect(joinMath(splitMath(source))).toBe(source);
  });

  test('node label templates number neurons, as a TeX group inside math', () => {
    expect(nodeLabelText('$x_{i}$', 12)).toBe('$x_{12}$');
    expect(nodeLabelText('h{i}', 3)).toBe('h3');
    expect(nodeLabelText('n{i} $w_{i}$', 7)).toBe('n7 $w_{7}$');
  });

  test('formulas become outlined math items; invalid or unsafe TeX is reported and shown as source', async () => {
    const result = await layout(
      'layers:\n  - { units: 2, name: "$h^{(1)}$" }\n  - { units: 2, name: "$\\\\frac{1$" }\n  - { units: 2, name: "$\\\\href{https://x}{y}$" }',
    );
    const math = result.scene.items.filter((i): i is MathItem => i.kind === 'math');
    expect(math.map((m) => [m.id, m.tex])).toEqual([['name-0-0', 'h^{(1)}']]);
    expect(math[0]!.outline).toMatch(/^M[\d. -]+/);
    expect(result.diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['text.math-invalid', ['layers', 1, 'name']],
      ['text.math-invalid', ['layers', 2, 'name']],
    ]);
    expect(result.diagnostics[1]!.message).toContain('\\href');
    const fallback = result.scene.items.find((i) => i.id === 'name-1');
    expect(fallback).toMatchObject({ kind: 'text', text: '$\\frac{1$' });
  });

  test('node labels sit inside nodes and warn when wider than them', async () => {
    const result = await layout(
      'layers:\n  - { units: 12, nodeLabel: "$x_{i}$" }\n  - { units: 2, nodeLabel: "neuron number {i}" }',
    );
    const ids = result.scene.items.filter((i) => i.id.startsWith('nodelabel-0-')).map((i) => i.id);
    // Collapsed: first three and last three, numbered 1-3 and 10-12.
    expect(ids.filter((id) => /^nodelabel-0-\d+$/.test(id))).toEqual([
      'nodelabel-0-0',
      'nodelabel-0-1',
      'nodelabel-0-2',
      'nodelabel-0-9',
      'nodelabel-0-10',
      'nodelabel-0-11',
    ]);
    const tex = result.scene.items
      .filter((i): i is MathItem => i.kind === 'math')
      .map((m) => m.tex);
    expect(tex).toContain('x_{12}');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['layout.node-label-wide']);
  });
});

describe('bidi and scripts', () => {
  test('base direction comes from the first strong letter', async () => {
    const engine = await getEngine();
    const texts = ['ورودی (x)', 'ReLU لایه', 'שכבה', '123 لایه', 'Input'];
    await engine.load(texts.map((text) => ({ text, font: medium })));
    expect(texts.map((t) => engine.shape(t, medium, 13).direction)).toEqual([
      'rtl',
      'ltr',
      'rtl',
      'rtl',
      'ltr',
    ]);
  });

  test('Persian letters keep their word together across a zero-width non-joiner', async () => {
    const engine = await getEngine();
    const text = 'پیکسل‌ها';
    await engine.load([{ text, font: medium }]);
    const shaped = engine.shape(text, medium, 13);
    expect(new Set(shaped.glyphs.map((g) => g.face)).size).toBe(1);
    expect([shaped.missing, shaped.pending]).toEqual([[], []]);
    // Glyphs are placed left to right in visual order.
    const xs = shaped.glyphs.map((g) => g.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  test('Han characters follow the label language: kana means Japanese', async () => {
    const engine = await getEngine();
    const chinese = '漢字';
    const japanese = 'かな漢字';
    await engine.load([chinese, japanese].map((text) => ({ text, font: medium })));
    const han = (text: string) => engine.shape(text, medium, 13).glyphs.at(-1)!.face;
    expect(han(chinese)).not.toBe(han(japanese));
  });

  test('loading is incremental: a second load of the same model loads nothing', async () => {
    const engine = await getEngine();
    const m = model('layers:\n  - { units: 2, name: "שלום $\\\\beta$" }\n  - 3');
    await prepareModel(m, engine);
    expect(await prepareModel(m, engine)).toBe(false);
  });

  test('right to left flow puts the input layer on the right', async () => {
    const { scene } = await layout('layers: [3, 2]\nstyle: { direction: rtl }');
    const x = (id: string) => scene.items.find((i): i is CircleItem => i.id === id)!.cx;
    expect(x('node-0-0')).toBeGreaterThan(x('node-1-0'));
    const ltr = await layout('layers: [3, 2]');
    expect(scene.width).toBe(ltr.scene.width);
  });
});
