// Convolutional GANs (feature maps inside the funnels) and the training arrows of style.training.

import { describe, expect, test } from 'vitest';
import {
  formatShorthand,
  layoutModel,
  parseModel,
  prepareModel,
  renderTikz,
  totalParams,
  type Scene,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

const DCGAN =
  'gan(100-reshape(4x4x64)-deconv(32,4x4,s2)-deconv(3,4x4,s2):tanh | in(16x16x3)-conv(32,4x4,s2)-flatten-1)';

async function sceneOf(text: string): Promise<Scene> {
  const engine = await getEngine();
  const parsed = parseModel(text);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  await prepareModel(parsed.model!, engine);
  return layoutModel(parsed.model!, engine).scene;
}

describe('convolutional GANs', () => {
  test('map layers parse inside both networks and write back', () => {
    const model = parseModel(DCGAN).model!;
    expect(formatShorthand(model)).toBe(DCGAN);
  });

  test('the generator starts with the noise and the discriminator ends in the score', () => {
    const noise = parseModel('gan(in(8x8x1)-16 | 16-1)').diagnostics;
    expect(noise.map((d) => d.code)).toContain('model.gan-noise');
    const score = parseModel('gan(4-in(8x8x1)-conv(2,3x3) | in(8x8x2)-conv(1,3x3))').diagnostics;
    expect(score.map((d) => d.code)).toContain('model.gan-score');
  });

  test('both networks are counted, maps included', () => {
    const { count } = totalParams(parseModel(DCGAN).model!);
    // Generator: reshape (none), 4x4x64x32+32, 4x4x32x3+3. Discriminator: 4x4x3x32+32, 8x8x32+1.
    expect(count).toBe(
      4 * 4 * 64 * 32 + 32 + 4 * 4 * 32 * 3 + 3 + 4 * 4 * 3 * 32 + 32 + 8 * 8 * 32 + 1,
    );
  });

  test('maps are drawn as sheets inside the funnels, in the animation layers', async () => {
    const scene = await sceneOf(DCGAN);
    const sheets = scene.items.filter((i) => i.id.startsWith('sheet-'));
    expect(sheets.length).toBeGreaterThan(6);
    expect(scene.items.find((i) => i.id === 'sheet-1-0')?.parent).toBe('layer-1');
    expect(
      scene.items.some((i) => i.id === 'size-generator' || i.parent === 'size-generator'),
    ).toBe(true);
    expect(renderTikz(scene)).toContain('xm sheet');
  });
});

describe('training arrows', () => {
  test('the switch draws two dashed loss arrows under the labels', async () => {
    const plain = await sceneOf('gan(100-256-784 | 784-256-1)');
    const scene = await sceneOf(
      'style: { training: true }\nlayers: "gan(100-256-784 | 784-256-1)"',
    );
    const ids = scene.items.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining(['train-d', 'train-g', 'train-d-label', 'train-g-label']),
    );
    const line = scene.items.find((i) => i.id === 'train-d');
    expect(line?.kind === 'path' && line.paint.dash).toEqual([5, 4]);
    expect(scene.height).toBeGreaterThan(plain.height);
    expect(plain.items.some((i) => i.id.startsWith('train-'))).toBe(false);
  });
});
