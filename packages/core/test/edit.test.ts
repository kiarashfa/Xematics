import { describe, expect, test } from 'vitest';
import {
  applyStructure,
  insertLayer,
  moveLayer,
  parseModel,
  parseShorthand,
  patchLayer,
  patchModel,
  patchStyle,
  removeLayer,
  structureOf,
  toYaml,
  updateText,
  type Model,
} from '../src/index.ts';

function model(text: string): Model {
  const parsed = parseModel(text);
  if (!parsed.model) throw new Error(parsed.diagnostics.map((d) => d.message).join('\n'));
  return parsed.model;
}

/** Applies an edit to text and checks the new text parses back to exactly the edited model. */
function edit(text: string, change: (m: Model) => Model) {
  const parsed = parseModel(text);
  const before = parsed.model!;
  const after = change(before);
  const result = updateText(text, parsed.format, before, after);
  expect(parseModel(result.text).model).toEqual(after);
  return result;
}

describe('model edits', () => {
  const base = model('3-5-2');

  test('patch, insert, remove and move layers', () => {
    expect(patchLayer(base, 1, { name: 'Hidden', units: 8 }).layers[1]).toEqual({
      type: 'dense',
      units: 8,
      name: 'Hidden',
    });
    expect(
      patchLayer(patchLayer(base, 1, { name: 'x' }), 1, { name: undefined }).layers[1],
    ).toEqual({ type: 'dense', units: 5 });
    expect(insertLayer(base, 1).layers.map((l) => ('units' in l ? l.units : 0))).toEqual([
      3, 4, 5, 2,
    ]);
    expect(removeLayer(base, 0).layers.map((l) => ('units' in l ? l.units : 0))).toEqual([5, 2]);
    expect(removeLayer(model('3'), 0).layers).toHaveLength(1);
    expect(moveLayer(base, 0, 1).layers.map((l) => ('units' in l ? l.units : 0))).toEqual([
      5, 3, 2,
    ]);
    expect(moveLayer(base, 0, -1)).toBe(base);
  });

  test('style patches merge nested objects and drop empty ones', () => {
    const styled = patchStyle(base, { labels: { names: false }, collapse: { first: 2 } });
    expect(styled.style).toEqual({ labels: { names: false }, collapse: { first: 2 } });
    const merged = patchStyle(styled, { labels: { sizes: false }, background: 'transparent' });
    expect(merged.style).toEqual({
      labels: { names: false, sizes: false },
      collapse: { first: 2 },
      background: 'transparent',
    });
    const cleared = patchStyle(merged, {
      labels: { names: undefined, sizes: undefined },
      collapse: { first: undefined },
      background: undefined,
    });
    expect(cleared.style).toBeUndefined();
  });

  test('title and description', () => {
    expect(patchModel(base, { title: 'Net' }).title).toBe('Net');
    expect(patchModel(patchModel(base, { title: 'Net' }), { title: undefined })).toEqual(base);
  });

  test('structure edits keep names and other per-layer settings', () => {
    const named = model(
      'layers:\n  - { units: 784, name: Pixels }\n  - { units: 16, activation: relu, collapse: false }\n  - 10',
    );
    expect(structureOf(named)).toBe('784-16:relu-10');
    const next = applyStructure(named, parseShorthand('784-32-16:tanh-10').layers);
    expect(next.layers).toEqual([
      { type: 'dense', units: 784, name: 'Pixels' },
      { type: 'dense', units: 32, collapse: false },
      { type: 'dense', units: 16, activation: 'tanh' },
      { type: 'dense', units: 10 },
    ]);
  });

  test('structure edits keep input and output names when hidden layers are added or removed', () => {
    const named = model(
      'layers:\n  - { units: 784, name: Pixels }\n  - 16\n  - { units: 10, name: Digits }',
    );
    const names = (m: Model) => m.layers.map((l) => l.name ?? '');
    expect(names(applyStructure(named, parseShorthand('784-32-16-10').layers))).toEqual([
      'Pixels',
      '',
      '',
      'Digits',
    ]);
    expect(names(applyStructure(named, parseShorthand('784-10').layers))).toEqual([
      'Pixels',
      'Digits',
    ]);
    expect(
      names(
        applyStructure(
          model('layers:\n  - { units: 3, name: Only }'),
          parseShorthand('3-2').layers,
        ),
      ),
    ).toEqual(['Only', '']);
  });
});

describe('updateText', () => {
  test('shorthand stays shorthand while it can', () => {
    expect(edit('784-16-10', (m) => patchLayer(m, 1, { units: 32 }))).toEqual({
      text: '784-32-10',
      format: 'shorthand',
    });
    expect(edit('784-16-10', (m) => patchLayer(m, 1, { activation: 'relu' })).text).toBe(
      '784-16:relu-10',
    );
  });

  test('shorthand keeps repeats when the text has them', () => {
    expect(edit('784-128*3-10', (m) => patchLayer(m, 2, { units: 64 })).text).toBe(
      '784-128-64-128-10',
    );
    expect(edit('784-128*3-10', (m) => patchLayer(m, 3, { units: 64 })).text).toBe(
      '784-128*2-64-10',
    );
    expect(edit('784-16-16-10', (m) => patchLayer(m, 0, { units: 8 })).text).toBe('8-16-16-10');
  });

  test('shorthand becomes readable YAML when it cannot express the change', () => {
    const result = edit('784-16-10', (m) => patchLayer(m, 0, { name: 'Pixels' }));
    expect(result.format).toBe('yaml');
    expect(result.text).toBe(
      'version: 1\nlayers:\n  - { units: 784, name: Pixels }\n  - { units: 16 }\n  - { units: 10 }\n',
    );
  });

  test('YAML edits keep comments and untouched lines', () => {
    const text =
      '# My network\nlayers:\n  - { units: 784, name: Pixels } # input\n  - 16\n  - { units: 10 }\nstyle:\n  labels: { sizes: false } # quieter\n';
    const renamed = edit(text, (m) => patchLayer(m, 2, { name: 'Digits' }));
    expect(renamed.text).toBe(
      '# My network\nlayers:\n  - { units: 784, name: Pixels } # input\n  - 16\n  - { units: 10, name: Digits }\nstyle:\n  labels: { sizes: false } # quieter\n',
    );
    const bare = edit(text, (m) => patchLayer(m, 1, { name: 'Hidden' }));
    expect(bare.text).toContain('  - { units: 16, name: Hidden }');
    expect(bare.text).toContain('# My network');
    const styled = edit(text, (m) => patchStyle(m, { labels: { names: false } }));
    expect(styled.text).toContain('labels: { sizes: false, names: false } # quieter');
  });

  test('YAML edits handle added and removed layers, titles and style', () => {
    const text = 'layers: [3, 5, 2]\n';
    expect(edit(text, (m) => insertLayer(m, 1)).format).toBe('yaml');
    edit(text, (m) => removeLayer(m, 1));
    edit(text, (m) => patchModel(m, { title: 'Tiny' }));
    edit('layers: 784-16-10\n', (m) => patchLayer(m, 0, { name: 'In' }));
    edit('[3, 2]', (m) => patchModel(m, { title: 'From a list' }));
    edit('layers:\n  - { units: 3, collapse: true }\n', (m) =>
      patchLayer(m, 0, { collapse: { first: 1 } }),
    );
  });

  test('JSON stays JSON', () => {
    const result = edit('{"layers": [3, 2]}', (m) => patchLayer(m, 0, { name: 'In' }));
    expect(result.format).toBe('json');
    expect(JSON.parse(result.text)).toEqual({
      version: 1,
      layers: [{ units: 3, name: 'In' }, { units: 2 }],
    });
  });

  test('toYaml writes defaults-free, readable YAML', () => {
    const m = patchStyle(patchModel(model('3-2'), { title: 'T' }), { labels: { names: false } });
    expect(toYaml(m)).toBe(
      'version: 1\ntitle: T\nlayers:\n  - { units: 3 }\n  - { units: 2 }\nstyle:\n  labels: { names: false }\n',
    );
  });
});
