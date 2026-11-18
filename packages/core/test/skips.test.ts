// Skip connections (res( ) and skip: { from, op }) and the deconv, up and reshape layers.

import { describe, expect, test } from 'vitest';
import {
  formatShorthand,
  inferShapes,
  insertLayer,
  layerParamCounts,
  layoutModel,
  moveLayer,
  parseModel,
  parseShorthand,
  prepareModel,
  removeLayer,
  renderTikz,
  shapeText,
  shorthandFormatOf,
  type Layer,
  type Model,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

const model = (text: string): Model => {
  const parsed = parseModel(text);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return parsed.model!;
};
const froms = (layers: readonly Layer[]) =>
  layers.map((l) => ('skip' in l && l.skip ? l.skip.from : undefined));
const shapes = (text: string) => inferShapes(model(text)).shapes.map(shapeText);

describe('res( ) in the shorthand', () => {
  test('the layer before the block is added to its last layer', () => {
    expect(froms(parseShorthand('784-res(64-64)-10').layers)).toEqual([
      undefined,
      undefined,
      1,
      undefined,
    ]);
  });

  test('repeated and nested blocks each point at their own start', () => {
    const { layers } = parseShorthand('in(32x32x3)-conv(16,3x3)-res(conv(16,3x3)*2)*2-gap');
    expect(froms(layers)).toEqual([undefined, undefined, undefined, 2, undefined, 4, undefined]);
    expect(froms(parseShorthand('8-res(res(8-8)-8)').layers)).toEqual([undefined, undefined, 1, 1]);
  });

  test('blocks need a layer before them and cannot end together', () => {
    expect(parseShorthand('res(8-8)-4').diagnostics[0]?.code).toBe('shorthand.res-first');
    expect(parseShorthand('4-res(res(8-8))').diagnostics[0]?.code).toBe('shorthand.res-end');
    expect(parseShorthand('4-res(8):relu').diagnostics[0]?.code).toBe('shorthand.no-activation');
    expect(parseShorthand('gan(4-res(8-8) | 8-1)').diagnostics[0]?.code).toBe(
      'shorthand.gan-dense',
    );
  });

  test('add skips write back as res( ), folded like the source', () => {
    for (const text of [
      '784-res(64-64)-10',
      'in(32x32x3)-conv(16,3x3)-res(conv(16,3x3)*2)*2-gap-10',
      '8-res(res(8-8)-8)',
    ]) {
      expect(formatShorthand(model(text), shorthandFormatOf(text))).toBe(text);
    }
    const concat = 'layers:\n  - 8\n  - 8\n  - { units: 8, skip: { from: 1, op: concat } }';
    expect(formatShorthand(model(concat))).toBeUndefined();
  });
});

describe('shapes and checks', () => {
  test('concatenation stacks channels; addition keeps the shape and warns on a mismatch', () => {
    const yaml = (op: string, filters: number) =>
      `layers:\n  - { type: input, shape: [8, 8, 3] }\n  - { type: conv, filters: 4, kernel: 3 }\n  - { type: conv, filters: ${filters}, kernel: 3, skip: { from: 2, op: ${op} } }`;
    expect(shapes(yaml('concat', 4)).at(-1)).toBe('8×8×8');
    expect(shapes(yaml('add', 4)).at(-1)).toBe('8×8×4');
    expect(inferShapes(model(yaml('add', 6))).diagnostics[0]?.code).toBe('shape.skip-mismatch');
  });

  test('a skip must come from an earlier layer', () => {
    const parsed = parseModel('layers:\n  - 4\n  - { units: 4, skip: { from: 3 } }\n  - 4');
    expect(parsed.diagnostics[0]).toMatchObject({ code: 'model.skip-from', severity: 'error' });
  });

  test('deconv, up and reshape grow and reshape maps; only deconv learns', () => {
    expect(shapes('in(8x8x3)-deconv(4,4x4,s2)-up(2)-deconv(2,3x3,s2,valid)')).toEqual([
      '8×8×3',
      '16×16×4',
      '32×32×4',
      '65×65×2',
    ]);
    const counts = layerParamCounts(model('in(8x8x3)-deconv(4,4x4,s2)-up(2)'));
    expect(counts.map((p) => p && p.weights + p.biases)).toEqual([undefined, 4 * 4 * 3 * 4 + 4, 0]);
    expect(shapes('100-reshape(4x4x8)')).toEqual(['100', '4×4×8']);
    expect(inferShapes(model('100-reshape(4x4x8)')).diagnostics[0]?.code).toBe(
      'shape.reshape-size',
    );
    expect(formatShorthand(model('128-reshape(4x4x8)-deconv(3,4x4,s2):tanh'))).toBe(
      '128-reshape(4x4x8)-deconv(3,4x4,s2):tanh',
    );
  });
});

describe('editing keeps skips right', () => {
  const base = () => model('784-res(64-64)-10');
  test('inserting before the source renumbers it', () => {
    expect(froms(insertLayer(base(), 0, { type: 'dense', units: 2 }).layers)[3]).toBe(2);
    expect(froms(insertLayer(base(), 2, { type: 'dense', units: 2 }).layers)[3]).toBe(1);
  });
  test('removing the source drops the skip; removing another layer renumbers it', () => {
    expect(froms(removeLayer(base(), 0).layers)).toEqual([undefined, undefined, undefined]);
    const extra = insertLayer(base(), 0, { type: 'dense', units: 2 });
    expect(froms(removeLayer(extra, 0).layers)[2]).toBe(1);
  });
  test('moving a layer keeps its skip while the source still comes first', () => {
    expect(froms(moveLayer(base(), 2, -1).layers)).toEqual([undefined, 1, undefined, undefined]);
    // Swapping a layer with its own source leaves no earlier layer to take the skip from.
    expect(froms(moveLayer(model('784-res(64)-10'), 0, 1).layers)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('drawing', () => {
  test('arcs and joins are drawn in the layout and the TikZ export', async () => {
    const engine = await getEngine();
    const m = model('in(16x16x3)-conv(8,3x3)-res(conv(8,3x3)*2)-gap-10');
    await prepareModel(m, engine);
    const scene = layoutModel(m, engine).scene;
    const ids = scene.items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['skips', 'skip-3', 'skip-3-head', 'join-3']));
    const tex = renderTikz(scene);
    expect(tex).toContain('% Skip connections');
    expect(tex).toMatch(/\\draw\[xm skip add\]/);
  });

  test('a fully connected network with a skip uses the convolutional layout', async () => {
    const engine = await getEngine();
    const m = model('784-res(64-64)-10');
    await prepareModel(m, engine);
    const scene = layoutModel(m, engine).scene;
    expect(scene.items.some((i) => i.id === 'join-2')).toBe(true);
    expect(scene.items.some((i) => i.id === 'node-1-0')).toBe(true);
  });
});
