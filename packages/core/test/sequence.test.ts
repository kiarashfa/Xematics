// Recurrent networks, GANs, Transformers and autoencoders: shorthand, validation, shape inference,
// layout, animation and exports.

import { describe, expect, test } from 'vitest';
import {
  buildTimeline,
  changeLayerType,
  familyOf,
  formatShorthand,
  inferShapes,
  labelContent,
  layoutModel,
  parseModel,
  parseShorthand,
  prepareModel,
  renderPdf,
  renderTikz,
  resolveTheme,
  shapeText,
  structureOf,
  toYaml,
  type Model,
  type Scene,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

const LSTM = 'seq(20x32)-lstm(64)-fc(10):softmax';
const GAN = 'gan(100-256-512-784:tanh | 784-512-256-1:sigmoid)';
const GPT = 'tokens(1024)-embed(768)-decoder(12,12)-fc(50257):softmax';
const ENCDEC = 'tokens(512)-embed(512)-encoder(6,8)-decoder(6,8)-fc(37000):softmax';

function model(text: string): Model {
  const parsed = parseModel(text);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return parsed.model!;
}

async function sceneOf(text: string): Promise<Scene> {
  const engine = await getEngine();
  const m = model(text);
  await prepareModel(m, engine);
  return layoutModel(m, engine).scene;
}

const ids = (scene: Scene) => scene.items.map((i) => i.id);

describe('shorthand', () => {
  test.each([
    ['seq(20x32)', { type: 'sequence', steps: 20, features: 32 }],
    ['seq(20)', { type: 'sequence', steps: 20, features: 1 }],
    ['lstm(64)', { type: 'lstm', units: 64 }],
    ['gru(64,last):tanh', { type: 'gru', units: 64, last: true, activation: 'tanh' }],
    ['bilstm(32)', { type: 'lstm', units: 32, bidirectional: true }],
    ['BiRNN(8, last)', { type: 'rnn', units: 8, bidirectional: true, last: true }],
    ['tokens(512)', { type: 'tokens', length: 512 }],
    ['embedding(768)', { type: 'embed', width: 768 }],
    ['encoder(6,8)', { type: 'encoder', blocks: 6, heads: 8 }],
    ['decoder(12, 12, 3072)', { type: 'decoder', blocks: 12, heads: 12, ff: 3072 }],
  ])('%s', (text, layer) => {
    const parsed = parseShorthand(text);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.layers).toEqual([layer]);
  });

  test('gan and autoencoders hold whole networks', () => {
    expect(parseShorthand(GAN).layers).toEqual([
      {
        type: 'gan',
        generator: [
          { type: 'dense', units: 100 },
          { type: 'dense', units: 256 },
          { type: 'dense', units: 512 },
          { type: 'dense', units: 784, activation: 'tanh' },
        ],
        discriminator: [
          { type: 'dense', units: 784 },
          { type: 'dense', units: 512 },
          { type: 'dense', units: 256 },
          { type: 'dense', units: 1, activation: 'sigmoid' },
        ],
      },
    ]);
    expect(parseShorthand('ae(784-32)').layers).toEqual([
      {
        type: 'autoencoder',
        encoder: [
          { type: 'dense', units: 784 },
          { type: 'dense', units: 32 },
        ],
      },
    ]);
    expect(parseShorthand('vae(8-2 | 2-4-8)').layers[0]).toMatchObject({
      type: 'autoencoder',
      vae: true,
      decoder: [{ units: 2 }, { units: 4 }, { units: 8 }],
    });
  });

  test.each([
    ['gan(100-784)', 'shorthand.expected-gan'],
    ['gan(100-784 | 784-1 | 1-2)', 'shorthand.unexpected'],
    ['gan(in(28x28)-784 | 784-1)', 'shorthand.gan-dense'],
    ['gan(100 | 784-1)', 'shorthand.gan-short'],
    ['gan(100-784 | 784-1', 'shorthand.expected-paren'],
    ['ae(784)', 'shorthand.gan-short'],
    ['lstm(64x2)', 'shorthand.unexpected'],
    ['lstm()', 'shorthand.expected-size'],
    ['encoder(6)', 'shorthand.expected-size'],
    ['encoder(6,8,2048,1)', 'shorthand.unexpected'],
    ['dense(16,last)', 'shorthand.unexpected-option'],
    ['seq(2x3x4)', 'shorthand.expected-shape'],
    ['lstm(64,fast)', 'shorthand.unknown-option'],
    ['tokens(1)-embed(4):relu', 'shorthand.no-activation'],
  ])('error for %j', (text, code) => {
    const { layers, diagnostics } = parseShorthand(text);
    expect(layers).toEqual([]);
    expect(diagnostics[0]?.code).toBe(code);
  });

  test('errors inside a gan point at the right column', () => {
    const { diagnostics } = parseShorthand('gan(100-x | 784-1)');
    expect(diagnostics[0]?.column).toBe(9);
    expect(diagnostics[0]?.message).toMatch(/^In the generator: /);
  });

  test.each([
    'seq(20x32)-lstm(64)-10:softmax',
    'seq(20)-bigru(64,last)-2',
    'tokens(50)-embed(128)-rnn(16)',
    GAN,
    'tokens(1024)-embed(768)-decoder(12,12)-50257:softmax',
    'tokens(8)-embed(4)-encoder(1,1,16)',
    'ae(784-256-32)',
    'vae(8-2 | 2-4-8:sigmoid)',
  ])('%s round-trips', (text) => {
    expect(formatShorthand(model(text))).toBe(text);
  });
});

describe('validation and shapes', () => {
  test('YAML networks accept sizes, layers or a shorthand', () => {
    const m = model(
      'layers:\n  - type: gan\n    generator: 100-256-784:tanh\n    discriminator: [784, { units: 1, activation: sigmoid }]',
    );
    expect(m.layers[0]).toMatchObject({
      generator: [{ units: 100 }, { units: 256 }, { units: 784, activation: 'tanh' }],
      discriminator: [{ units: 784 }, { units: 1, activation: 'sigmoid' }],
    });
    expect(
      model('layers:\n  - { type: autoencoder, encoder: [8, 4, 2], vae: true }').layers[0],
    ).toMatchObject({
      vae: true,
    });
  });

  test('shapes follow sequences', () => {
    const shapes = inferShapes(model('seq(20x32)-bilstm(64)-gru(16,last)-fc(2)')).shapes;
    expect(shapes.map(shapeText)).toEqual(['20×32', '20×128', '16', '2']);
    const tf = inferShapes(model(GPT)).shapes;
    expect(tf.map(shapeText)).toEqual(['1024', '1024×768', '1024×768', '1024×50257']);
  });

  test('an encoder straight after tokens warns', () => {
    const parsed = parseModel('tokens(8)-encoder(2,2)');
    expect(parsed.model).toBeDefined();
    expect(inferShapes(parsed.model!).diagnostics.map((d) => d.code)).toEqual([
      'shape.needs-embed',
    ]);
  });

  test.each([
    ['lstm(4)-fc(2)', 'model.needs-input'],
    ['16-lstm(4)', 'model.needs-sequence'],
    ['seq(4x2)-seq(4x2)-lstm(2)', 'model.input-not-first'],
    [`${GAN}-10`, 'model.gan-alone'],
    ['ae(8-2)-4', 'model.autoencoder-alone'],
    ['seq(4x2)-conv(2,3)', 'model.mixed-family'],
    ['tokens(8)-embed(4)-lstm(4)-encoder(1,1)', 'model.mixed-family'],
    ['tokens(8)-embed(4)-decoder(1,1)-encoder(1,1)', 'model.encoder-after-decoder'],
  ])('%s is refused', (text, code) => {
    const parsed = parseModel(text);
    expect(parsed.model).toBeUndefined();
    expect(parsed.diagnostics.map((d) => d.code)).toContain(code);
  });

  test('families', () => {
    expect(familyOf(model(LSTM))).toBe('rnn');
    expect(familyOf(model('seq(4x2)-fc(2)'))).toBe('rnn');
    expect(familyOf(model(GPT))).toBe('transformer');
    expect(familyOf(model('tokens(8)-embed(4)-fc(2)'))).toBe('transformer');
    expect(familyOf(model(GAN))).toBe('gan');
    expect(familyOf(model('ae(8-2)'))).toBe('autoencoder');
    expect(familyOf(model('8-4-8'))).toBe('mlp');
  });
});

describe('layout', () => {
  test.each([
    [LSTM, 'rnn'],
    ['layers: seq(3x3)-rnn(4)-fc(2)\nstyle: { recurrent: neurons }', 'rnn'],
    ['layers: seq(3x3)-gru(4)-fc(2)\nstyle: { cell: true }', 'rnn'],
    [GAN, 'gan'],
    [`layers: "${GAN}"\nstyle: { funnel: plain }`, 'gan'],
    [GPT, 'transformer'],
    [ENCDEC, 'transformer'],
    ['vae(784-256-32)', 'autoencoder'],
    ['layers: 6-3-2-3-6\nstyle: { autoencoder: true }', 'autoencoder'],
  ])('%s has unique ids and fits its canvas', async (text, family) => {
    const scene = await sceneOf(text);
    expect(scene.family).toBe(family);
    expect(new Set(ids(scene)).size).toBe(scene.items.length);
    const parents = new Set(scene.items.filter((i) => i.kind === 'group').map((i) => i.id));
    for (const item of scene.items) if (item.parent) expect(parents.has(item.parent)).toBe(true);
    for (const item of scene.items) {
      if (item.kind === 'circle') {
        expect(item.cx - item.r).toBeGreaterThanOrEqual(0);
        expect(item.cx + item.r).toBeLessThanOrEqual(scene.width);
        expect(item.cy + item.r).toBeLessThanOrEqual(scene.height);
      }
      if (item.kind === 'rect') {
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.x + item.width).toBeLessThanOrEqual(scene.width);
      }
    }
  });

  test('long sequences draw the first steps, a gap and the last step', async () => {
    const scene = await sceneOf(LSTM);
    expect(ids(scene)).toContain('box-1-0');
    expect(ids(scene)).toContain('box-1-2');
    expect(ids(scene)).toContain('ellipsis-1');
    expect(ids(scene)).toContain('box-1-19');
    expect(ids(scene)).not.toContain('box-1-3');
    const more = await sceneOf(`layers: "${LSTM}"\nstyle: { steps: 6 }`);
    expect(ids(more)).toContain('box-1-4');
  });

  test('many to one draws the head at the last step only', async () => {
    const scene = await sceneOf('seq(4x8)-gru(16,last)-fc(2)');
    expect(ids(scene).filter((id) => /^node-2-/.test(id))).toEqual(['node-2-3']);
    expect(ids(scene)).toContain('box-1-0');
  });

  test('bidirectional layers get a backward row', async () => {
    const scene = await sceneOf('seq(3x8)-bilstm(16)-fc(2)');
    expect(ids(scene)).toContain('box-1-0-b');
    expect(ids(scene)).toContain('state-1-0-c-b');
  });

  test('right to left mirrors the layout', async () => {
    const ltr = await sceneOf(GPT);
    const rtl = await sceneOf(`layers: "${GPT}"\nstyle: { direction: rtl }`);
    expect(rtl.width).toBe(ltr.width);
    const box = (s: Scene) => s.items.find((i) => i.id === 'box-0')!;
    const a = box(ltr);
    const b = box(rtl);
    if (a.kind !== 'rect' || b.kind !== 'rect') throw new Error('expected rects');
    expect(b.x).toBeCloseTo(ltr.width - a.x - a.width, 6);
  });

  test('names in slim boxes are turned', async () => {
    const scene = await sceneOf(GPT);
    const label = scene.items.find((i) => i.id === 'box-2-0-label');
    expect(label?.kind === 'text' && label.rotate?.angle).toBe(-90);
  });

  test('labels load their fonts first, and formulas for the cell figure', () => {
    const plain = labelContent(model(LSTM));
    expect(plain.text.map((t) => t.text)).toContain('LSTM');
    expect(plain.math).toEqual([]);
    const cell = labelContent(model(`layers: "${LSTM}"\nstyle: { cell: true }`));
    expect(cell.math).toContain('c_{t-1}');
  });

  test('weights style colors the connections of neuron looks', async () => {
    const scene = await sceneOf(`layers: "${GAN}"\nstyle: { weights: true }`);
    expect(scene.items.some((i) => i.classes?.includes('weight-positive'))).toBe(true);
  });

  test('descriptions say what the network is', async () => {
    expect((await sceneOf(LSTM)).description).toMatch(
      /^Recurrent neural network over 20 time steps/,
    );
    expect((await sceneOf(GAN)).description).toMatch(/^Generative adversarial network/);
    expect((await sceneOf(GPT)).description).toMatch(/^Transformer with/);
    expect((await sceneOf('vae(8-2)')).description).toMatch(/^Variational autoencoder/);
  });

  test('layout is deterministic', async () => {
    for (const text of [LSTM, GAN, ENCDEC, 'ae(784-256-64-16)']) {
      expect(JSON.stringify(await sceneOf(text))).toBe(JSON.stringify(await sceneOf(text)));
    }
  });
});

describe('animation and exports', () => {
  test.each([LSTM, GAN, GPT, 'ae(784-256-32)'])('%s animates layer by layer', async (text) => {
    const scene = await sceneOf(text);
    const timeline = buildTimeline(scene, resolveTheme(undefined), { look: 'pulse' });
    expect(timeline.tracks.length).toBeGreaterThan(0);
  });

  test('TikZ draws every family generically, PDF dashes frames', async () => {
    const tex = renderTikz(
      await sceneOf('layers: seq(3x3)-rnn(4)-fc(2)\nstyle: { recurrent: neurons }'),
    );
    expect(tex).toContain('% Diagram');
    expect(tex).toContain('dash pattern=on 2.25pt off 2.25pt');
    const pdf = new TextDecoder().decode(
      renderPdf(await sceneOf('layers: seq(3x3)-rnn(4)-fc(2)\nstyle: { recurrent: neurons }')),
    );
    expect(pdf).toContain('[3 3] 0 d');
    const gpt = renderTikz(await sceneOf(GPT));
    expect(gpt).toMatch(/rotate=90\] at .*\{Masked attention\}/);
    expect(gpt).not.toContain('fontspec');
  });
});

describe('editing', () => {
  test('changing a type keeps the activation where it fits', () => {
    const m = model('seq(4x2)-16:relu-2');
    const changed = changeLayerType(m, 1, 'lstm');
    expect(changed.layers[1]).toEqual({ type: 'lstm', units: 64, activation: 'relu' });
    expect(structureOf(changed)).toBe('seq(4x2)-lstm(64):relu-2');
  });

  test('YAML keeps the new layers', () => {
    const yaml = toYaml(model(ENCDEC));
    expect(yaml).toContain('type: encoder');
    expect(formatShorthand(model(yaml))).toBe(ENCDEC.replace('fc(37000)', '37000'));
  });
});
