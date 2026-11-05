// Convolutional models: shorthand, validation, shape inference, layout, editing and exports.

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  applyStructure,
  changeLayerType,
  formatShorthand,
  inferShapes,
  labelContent,
  layoutModel,
  parseModel,
  parseShorthand,
  prepareModel,
  renderDiagram,
  renderTikz,
  structureOf,
  type Layer,
  type Model,
  type Scene,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

const SMALL =
  'in(28x28x1)-conv(8,3x3):relu-pool(2)-conv(16,3x3):relu-pool(2)-flatten-fc(64):relu-fc(10):softmax';

async function sceneOf(text: string): Promise<Scene> {
  const engine = await getEngine();
  const parsed = parseModel(text);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  await prepareModel(parsed.model!, engine);
  return layoutModel(parsed.model!, engine).scene;
}

const ids = (scene: Scene) => scene.items.map((i) => i.id);

describe('CNN shorthand', () => {
  test('typed layers', () => {
    const { layers, diagnostics } = parseShorthand(SMALL);
    expect(diagnostics).toEqual([]);
    expect(layers).toEqual([
      { type: 'input', shape: [28, 28, 1] },
      { type: 'conv', filters: 8, kernel: 3, activation: 'relu' },
      { type: 'pool', size: 2 },
      { type: 'conv', filters: 16, kernel: 3, activation: 'relu' },
      { type: 'pool', size: 2 },
      { type: 'flatten' },
      { type: 'dense', units: 64, activation: 'relu' },
      { type: 'dense', units: 10, activation: 'softmax' },
    ]);
  });

  test.each<[string, Layer]>([
    ['in(32x32)', { type: 'input', shape: [32, 32] }],
    ['input(224 x 224 x 3)', { type: 'input', shape: [224, 224, 3] }],
    ['conv2d(16, 3)', { type: 'conv', filters: 16, kernel: 3 }],
    [
      'conv(16,3x5,s2,valid)',
      { type: 'conv', filters: 16, kernel: [3, 5], stride: 2, padding: 'valid' },
    ],
    ['conv(16,3x3,s1x2)', { type: 'conv', filters: 16, kernel: 3, stride: [1, 2] }],
    ['CONV(4,3×3)', { type: 'conv', filters: 4, kernel: 3 }],
    ['maxpool(2)', { type: 'pool', size: 2 }],
    ['avgpool(3,s2,same)', { type: 'pool', size: 3, stride: 2, padding: 'same', mode: 'avg' }],
    ['gap', { type: 'gap' }],
    ['flatten()', { type: 'flatten' }],
    ['fc(10)', { type: 'dense', units: 10 }],
  ])('%s', (text, layer) => {
    const result = parseShorthand(`in(8x8)-${text}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.layers.at(-1)).toEqual(layer);
  });

  test.each([
    ['conv(16)', 6, 'shorthand.expected-kernel'],
    ['conv', 5, 'shorthand.expected-paren'],
    ['in(28)', 4, 'shorthand.expected-shape'],
    ['in(28x28)-conv(8,3x3,s0)', 23, 'shorthand.size-range'],
    ['in(28x28)-conv(8,3x3,foo)', 22, 'shorthand.unknown-option'],
    ['in(28x28)-pool(2):relu', 18, 'shorthand.no-activation'],
    ['in(28x28)-pool(2x2x2)', 16, 'shorthand.unexpected'],
    ['in(28x28)-gap(3)', 15, 'shorthand.unexpected-option'],
    ['in(28x28', 9, 'shorthand.expected-paren'],
    ['in(28x28)-conv(8,3x3', 21, 'shorthand.expected-paren'],
    ['in(2000000x2)', 4, 'shorthand.size-range'],
  ])('error for %j at column %i', (text, column, code) => {
    const { layers, diagnostics } = parseShorthand(text);
    expect(layers).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code, line: 1, column });
  });

  test('formatShorthand writes typed tokens back', () => {
    const model = parseModel(
      'in(28x28x1)-conv(8,3x5,s2,valid):relu-avgpool(2,s1)-gap-fc(3)',
    ).model!;
    expect(formatShorthand(model)).toBe(
      'in(28x28x1)-conv(8,3x5,s2,valid):relu-avgpool(2,s1)-gap-3',
    );
    expect(structureOf(model)).toBe(formatShorthand(model));
  });
});

describe('CNN validation', () => {
  const errors = (text: string) =>
    parseModel(text).diagnostics.filter((d) => d.severity === 'error');

  test('an image layer must come first, and only there', () => {
    expect(errors('conv(8,3)-10')[0]).toMatchObject({ code: 'model.needs-input' });
    expect(errors('10-in(28x28)')[0]).toMatchObject({ code: 'model.input-not-first' });
    expect(errors('layers:\n  - 784\n  - { type: input, shape: [2, 2] }')[0]).toMatchObject({
      code: 'model.input-not-first',
      line: 3,
    });
  });

  test('unknown keys are checked against the layer type', () => {
    const [error] = errors(
      'layers:\n  - { type: input, shape: [8, 8] }\n  - { type: conv, filters: 4, kernal: 3 }',
    );
    expect(error?.message).toContain("unknown key 'kernal'. Did you mean 'kernel'?");
    expect(error?.message).toContain(
      'Allowed keys: type, filters, kernel, stride, padding, name, activation.',
    );
  });

  test('shapes must be two or three numbers', () => {
    expect(errors('layers:\n  - { type: input, shape: [8, 8, 3, 1] }')[0]?.message).toContain(
      'must be [height, width] or [height, width, channels]',
    );
  });

  test('old dense-only files are unchanged', () => {
    expect(parseModel('784-16-10').model!.layers).toEqual([
      { type: 'dense', units: 784 },
      { type: 'dense', units: 16 },
      { type: 'dense', units: 10 },
    ]);
  });
});

describe('shape inference', () => {
  const shapes = (text: string) => {
    const model = parseModel(text).model!;
    return inferShapes(model);
  };

  test('same and valid padding, strides, flatten and global pooling', () => {
    const { shapes: s, diagnostics } = shapes(
      'in(32x32x3)-conv(6,5,valid)-pool(2)-conv(16,3,s2)-avgpool(3,s2,same)-flatten-gap-10',
    );
    expect(diagnostics).toEqual([]);
    expect(s).toEqual([
      { kind: 'map', h: 32, w: 32, c: 3 },
      { kind: 'map', h: 28, w: 28, c: 6 },
      { kind: 'map', h: 14, w: 14, c: 6 },
      { kind: 'map', h: 7, w: 7, c: 16 },
      { kind: 'map', h: 4, w: 4, c: 16 },
      { kind: 'vector', n: 256 },
      { kind: 'vector', n: 256 },
      { kind: 'vector', n: 10 },
    ]);
  });

  test('windows that do not fit and maps after vectors are warnings', () => {
    const small = shapes('in(4x4)-conv(2,5,valid)-10');
    expect(small.shapes[1]).toEqual({ kind: 'map', h: 1, w: 1, c: 2 });
    expect(small.diagnostics[0]).toMatchObject({ severity: 'warning', code: 'shape.too-small' });
    const after = shapes('in(4x4)-flatten-conv(2,3)');
    expect(after.shapes[2]).toEqual({ kind: 'map', h: 1, w: 1, c: 2 });
    expect(after.diagnostics[0]).toMatchObject({ code: 'shape.map-after-vector' });
  });
});

describe('CNN layout', () => {
  test('sheets, rays, fans and edges have stable ids', async () => {
    const scene = await sceneOf(SMALL);
    const all = ids(scene);
    expect(all).toContain('sheet-0-0');
    expect(all.filter((id) => id.startsWith('sheet-1-'))).toHaveLength(7);
    expect(all).toContain('window-1');
    expect(all).toContain('ray-1-3');
    expect(all).toContain('raydot-4');
    expect(all).toContain('fan-4-0-0');
    expect(all).toContain('edge-5-0-6-0');
    expect(all).toContain('op-1');
    expect(all).toContain('op-5');
    expect(all).not.toContain('op-6');
    expect(new Set(all).size).toBe(all.length);
    expect(scene.description).toBe(
      'Convolutional neural network with 8 layers: Input (28×28×1), Conv 1 (conv 3×3, 28×28×8), Pool 1 (max 2×2, 14×14×8), Conv 2 (conv 3×3, 14×14×16), Pool 2 (max 2×2, 7×7×16), Flatten (flatten, 784 values), Dense (64 values), Output (10 values).',
    );
  });

  test('Layer boxes draws the head as bars with arrows', async () => {
    const scene = await sceneOf(`layers: ${JSON.stringify(SMALL)}\nstyle: { preset: boxes }`);
    const all = ids(scene);
    expect(all).toContain('box-6');
    expect(all).toContain('arrow-4');
    expect(all.some((id) => id.startsWith('node-'))).toBe(false);
  });

  test('right to left flow mirrors the figure', async () => {
    const ltr = await sceneOf(SMALL);
    const rtl = await sceneOf(`layers: ${JSON.stringify(SMALL)}\nstyle: { direction: rtl }`);
    expect(rtl.width).toBe(ltr.width);
    const dot = (s: Scene) => s.items.find((i) => i.id === 'raydot-1');
    const [a, b] = [dot(ltr), dot(rtl)];
    if (a?.kind !== 'circle' || b?.kind !== 'circle') throw new Error('missing ray end');
    expect(b.cx).toBeCloseTo(ltr.width - a.cx, 9);
  });

  test('op labels can be turned off; their text loads with the fonts', async () => {
    const model = parseModel(
      `layers: ${JSON.stringify(SMALL)}\nstyle: { labels: { ops: false } }`,
    ).model!;
    const engine = await getEngine();
    await prepareModel(model, engine);
    expect(ids(layoutModel(model, engine).scene).some((id) => id.startsWith('op-'))).toBe(false);
    const texts = labelContent(parseModel(SMALL).model!).text.map((t) => t.text);
    expect(texts).toContain('max 2×2');
    expect(texts).toContain('28×28×8');
  });

  test('output is deterministic and every export works', async () => {
    const engine = await getEngine();
    const a = await renderDiagram(SMALL, engine);
    const b = await renderDiagram(SMALL, engine);
    expect(a.svg).toBe(b.svg);
    const tex = renderTikz(a.scene!);
    expect(tex).toContain('xm map input/.style=');
    expect(tex).toContain('xm map pool/.style=');
    expect(tex).toContain('% Labels');
    expect(tex).toMatch(/\\draw\[xm edge\] \([\d.]+,[\d.]+\) -- \(n-5-0\);/);
  });
});

describe('CNN editing', () => {
  test('applyStructure keeps names of layers with the same type', () => {
    const model = parseModel(
      'layers:\n  - { type: input, shape: [28, 28], name: Image }\n  - { type: conv, filters: 4, kernel: 3, name: Edges }\n  - { units: 10, name: Digits }',
    ).model!;
    const next = applyStructure(model, parseShorthand('in(32x32x3)-conv(8,5)-pool(2)-10').layers);
    expect(next.layers).toEqual([
      { type: 'input', shape: [32, 32, 3], name: 'Image' },
      { type: 'conv', filters: 8, kernel: 5, name: 'Edges' },
      { type: 'pool', size: 2 },
      { type: 'dense', units: 10, name: 'Digits' },
    ]);
  });

  test('changeLayerType starts from usual values and keeps the name', () => {
    const model: Model = {
      version: 1,
      layers: [{ type: 'dense', units: 4, name: 'A', activation: 'relu' }],
    };
    expect(changeLayerType(model, 0, 'conv').layers[0]).toEqual({
      type: 'conv',
      filters: 16,
      kernel: 3,
      name: 'A',
      activation: 'relu',
    });
    expect(changeLayerType(model, 0, 'pool').layers[0]).toEqual({
      type: 'pool',
      size: 2,
      name: 'A',
    });
  });
});

describe('CNN robustness', () => {
  const layer = fc.oneof(
    fc.record({ type: fc.constant('dense' as const), units: fc.integer({ min: 1, max: 5000 }) }),
    fc.record(
      {
        type: fc.constant('conv' as const),
        filters: fc.integer({ min: 1, max: 1024 }),
        kernel: fc.oneof(
          fc.integer({ min: 1, max: 9 }),
          fc.tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 })),
        ),
        stride: fc.integer({ min: 1, max: 4 }),
        padding: fc.constantFrom('same' as const, 'valid' as const),
      },
      { requiredKeys: ['type', 'filters', 'kernel'] },
    ),
    fc.record(
      {
        type: fc.constant('pool' as const),
        size: fc.integer({ min: 1, max: 4 }),
        mode: fc.constant('avg' as const),
      },
      { requiredKeys: ['type', 'size'] },
    ),
    fc.constantFrom({ type: 'flatten' as const }, { type: 'gap' as const }),
  );
  const model = fc
    .tuple(
      fc.tuple(
        fc.integer({ min: 1, max: 512 }),
        fc.integer({ min: 1, max: 512 }),
        fc.integer({ min: 1, max: 64 }),
      ),
      fc.array(layer, { minLength: 0, maxLength: 12 }),
    )
    .map(([shape, rest]): Model => ({ version: 1, layers: [{ type: 'input', shape }, ...rest] }));

  test('shorthand round-trips', () => {
    fc.assert(
      fc.property(model, (m) => {
        // A [k, k] kernel is written as kxk and read back as k.
        const normal: Model = {
          ...m,
          layers: m.layers.map((l) =>
            l.type === 'conv' && typeof l.kernel !== 'number' && l.kernel[0] === l.kernel[1]
              ? { ...l, kernel: l.kernel[0] }
              : l,
          ),
        };
        expect(parseModel(formatShorthand(normal)!).model).toEqual(normal);
      }),
      { numRuns: 300 },
    );
  });

  test('every valid model lays out with finite numbers', async () => {
    const engine = await getEngine();
    await fc.assert(
      fc.asyncProperty(model, async (m) => {
        const result = await renderDiagram(JSON.stringify(m), engine);
        expect(result.svg).toBeDefined();
        expect(result.svg).not.toMatch(/NaN|Infinity/);
      }),
      { numRuns: 60 },
    );
  });
});
