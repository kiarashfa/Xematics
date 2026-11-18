// Transformer attention figures: style.transformer tokens (token flow) and heatmap.

import { describe, expect, test } from 'vitest';
import {
  formatShorthand,
  layoutModel,
  parseModel,
  patchModel,
  prepareModel,
  renderTikz,
  type Scene,
} from '../src/index.ts';
import { attentionWeights } from '../src/layout/tokens.ts';
import { updateText } from '../src/edit/text.ts';
import { getEngine } from './helpers.ts';

const GPT = 'tokens(1024)-embed(768)-decoder(12,12)-fc(50257):softmax';
const yaml = (look: string, words = '') =>
  `style: { transformer: ${look} }\n${words ? `tokens: [${words}]\n` : ''}layers: "${GPT}"`;

async function sceneOf(text: string): Promise<Scene> {
  const engine = await getEngine();
  const parsed = parseModel(text);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  await prepareModel(parsed.model!, engine);
  return layoutModel(parsed.model!, engine).scene;
}

describe('attention weights', () => {
  test('each query spreads one unit of attention; causal rows see only earlier tokens', () => {
    const w = attentionWeights(5, true, 42);
    for (const [i, row] of w.entries()) {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
      expect(row.slice(i + 1).every((v) => v === 0)).toBe(true);
    }
    expect(attentionWeights(5, true, 42)).toEqual(w);
    expect(
      attentionWeights(5, false, 42).some((row, i) => row.slice(i + 1).some((v) => v > 0)),
    ).toBe(true);
  });
});

describe('token flow', () => {
  test('one node per token per row: the embedding and the first and last blocks', async () => {
    const scene = await sceneOf(yaml('tokens', 'The, cat, sat'));
    const ids = scene.items.map((i) => i.id);
    expect(ids.filter((id) => /^node-\d+-\d+$/.test(id))).toHaveLength(4 * 3);
    expect(ids).toEqual(expect.arrayContaining(['token-0', 'name-3', 'edges-0', 'edges-2']));
    // Causal: no line from a later token into an earlier one.
    expect(ids).not.toContain('edge-0-2-1-0');
    expect(ids).toContain('edge-0-0-1-2');
    expect(scene.description).toContain('earlier tokens');
    expect(renderTikz(scene)).toMatch(/opacity=0\.\d+/);
  });

  test('without words the tokens are numbered with a subscript', async () => {
    const scene = await sceneOf(yaml('tokens'));
    expect(scene.items.some((i) => i.id === 'token-0-sub')).toBe(true);
  });
});

describe('heat map', () => {
  test('one cell per query and key; masked cells have no value', async () => {
    const scene = await sceneOf(yaml('heatmap', 'a, b, c'));
    const ids = scene.items.map((i) => i.id);
    expect(ids.filter((id) => id.startsWith('cell-'))).toHaveLength(9);
    expect(ids).toContain('value-2-0');
    expect(ids).not.toContain('value-0-2');
  });
});

describe('the word list', () => {
  test('is written as a short list in YAML and keeps the model out of the shorthand', () => {
    const text = 'tokens(16)-embed(8)-encoder(1,2)-fc(2)';
    const model = parseModel(text).model!;
    const after = patchModel(model, { tokens: ['I', 'am', 'here'] });
    const written = updateText(text, 'shorthand', model, after).text;
    expect(written).toContain('tokens: [ I, am, here ]');
    expect(formatShorthand(after)).toBeUndefined();
    expect(parseModel(written).model?.tokens).toEqual(['I', 'am', 'here']);
  });
});
