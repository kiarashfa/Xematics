// Parameter counts (style.labels.params) and drawn-size overrides of map layers.

import { describe, expect, test } from 'vitest';
import {
  formatShorthand,
  inferShapes,
  layerParamCounts,
  layoutModel,
  parseModel,
  prepareModel,
  renderTikz,
  totalParams,
  type Scene,
  type TextItem,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

const model = (text: string) => {
  const parsed = parseModel(text);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return parsed.model!;
};
const totals = (text: string) =>
  layerParamCounts(model(text)).map((p) => (p ? p.weights + p.biases : undefined));

async function sceneOf(text: string): Promise<Scene> {
  const engine = await getEngine();
  const m = model(text);
  await prepareModel(m, engine);
  return layoutModel(m, engine).scene;
}

describe('parameter counts', () => {
  test('fully connected layers: inputs times units, plus one bias per unit', () => {
    expect(totals('784-128-64-10')).toEqual([undefined, 100480, 8256, 650]);
    expect(totalParams(model('784-128-64-10'))).toEqual({ count: 109386, partial: false });
  });

  test('convolutions count kernel times input channels; pooling and flatten have none', () => {
    expect(totals('in(28x28x1)-conv(8,3x3)-pool(2)-conv(16,3x3)-flatten-fc(10)')).toEqual([
      undefined,
      80,
      0,
      1168,
      0,
      14 * 14 * 16 * 10 + 10,
    ]);
  });

  test('recurrent layers count every gate, both ways when bidirectional', () => {
    // LSTM: 4 gates of 64 x (32 + 64) weights and 64 biases.
    expect(totals('seq(20x32)-lstm(64)-fc(10)')).toEqual([undefined, 4 * 64 * 96 + 4 * 64, 650]);
    expect(totals('seq(20x32)-bigru(16,last)')[1]).toBe(2 * 3 * (16 * 48 + 16));
  });

  test('Transformer blocks: attention, feed-forward and norms; embeddings are not counted', () => {
    const [, embed, block] = totals('tokens(16)-embed(8)-encoder(2,2)-fc(4)');
    expect(embed).toBeUndefined();
    // Per block: 4(8x8 + 8) attention + (8x32 + 32) + (32x8 + 8) + 2(8 + 8) norms.
    expect(block).toBe(2 * (4 * 72 + 288 + 264 + 32));
    expect(totalParams(model('tokens(16)-embed(8)-encoder(2,2)-fc(4)')).partial).toBe(true);
  });

  test('GANs and autoencoders count both networks; a mirrored decoder counts too', () => {
    expect(totals('gan(4-8 | 8-1)')).toEqual([40 + 9]);
    expect(totals('ae(8-4)')).toEqual([36 + 40]);
  });

  test('the switch draws a small line under every layer and grows the figure', async () => {
    const plain = await sceneOf('784-128-10');
    const scene = await sceneOf('style: { labels: { params: true } }\nlayers: [784, 128, 10]');
    const lines = scene.items.filter((i): i is TextItem => i.id.startsWith('params-'));
    expect(lines.map((t) => t.text)).toEqual(['100,480 params', '1,290 params']);
    const size = scene.items.find((i) => i.id === 'size-1') as TextItem;
    expect(lines[0]!.x).toBe(size.x);
    expect(lines[0]!.y).toBeGreaterThan(size.y);
    expect(scene.height).toBeGreaterThan(plain.height);
    expect(renderTikz(scene)).toContain('{100,480 params}');
  });

  test('layers without parameters show a dash; family diagrams draw no counts', async () => {
    const scene = await sceneOf(
      [
        'style: { labels: { params: true } }',
        'layers:',
        '  - { type: input, shape: [28, 28, 1] }',
        '  - { type: conv, filters: 8, kernel: 3 }',
        '  - { type: pool, size: 2 }',
        '  - { type: flatten }',
        '  - 10',
      ].join('\n'),
    );
    const text = (id: string) => (scene.items.find((i) => i.id === id) as TextItem).text;
    expect(text('params-1')).toBe('80 params');
    expect(text('params-2')).toBe('-');
    const rnn = await sceneOf(
      'style: { labels: { params: true } }\nlayers:\n  - { type: sequence, steps: 4, features: 2 }\n  - { type: lstm, units: 4 }',
    );
    expect(rnn.items.some((i) => i.id.startsWith('params-'))).toBe(false);
  });
});

describe('drawn-size override', () => {
  const yaml = (shape: string) =>
    `layers:\n  - { type: input, shape: [28, 28, 1] }\n  - { type: conv, filters: 8, kernel: 3, padding: valid, shape: ${shape} }\n  - { type: flatten }`;

  test('a map layer is drawn at the given size, with a warning when it differs', () => {
    const { shapes, diagnostics } = inferShapes(model(yaml('24x24x8')));
    expect(shapes[1]).toEqual({ kind: 'map', h: 24, w: 24, c: 8 });
    expect(shapes[2]).toEqual({ kind: 'vector', n: 24 * 24 * 8 });
    expect(diagnostics[0]).toMatchObject({
      code: 'shape.override',
      message: 'Layer 2 is drawn as 24×24×8; from its settings it would be 26×26×8.',
    });
    expect(inferShapes(model(yaml('26x26'))).diagnostics).toEqual([]);
  });

  test('bad sizes are errors, and the shorthand cannot hold an override', () => {
    expect(parseModel(yaml('big')).diagnostics[0]?.message).toContain(
      'must be a size like 26x26x8',
    );
    expect(parseModel(yaml('0x4')).diagnostics[0]?.severity).toBe('error');
    expect(formatShorthand(model(yaml('24x24x8')))).toBeUndefined();
  });
});
