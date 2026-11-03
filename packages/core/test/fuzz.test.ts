import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { formatShorthand, parseModel, renderDiagram, type Model } from '../src/index.ts';
import { getEngine } from './helpers.ts';

const shorthandChars = fc.constantFrom(...'0123456789-, :()abcdefrlux_\t'.split(''));

describe('parser robustness', () => {
  test('never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 80 }), (text) => {
        parseModel(text);
      }),
      { numRuns: 500 },
    );
  });

  test('never throws on shorthand-like text, and errors always have a column', () => {
    fc.assert(
      fc.property(fc.string({ unit: shorthandChars, maxLength: 40 }), (text) => {
        const { model, diagnostics } = parseModel(text);
        if (!model)
          expect(diagnostics.every((d) => d.severity !== 'error' || d.column !== undefined)).toBe(
            true,
          );
      }),
      { numRuns: 1000 },
    );
  });

  test('never throws on arbitrary JSON, and whatever parses also renders', async () => {
    const engine = await getEngine();
    await fc.assert(
      fc.asyncProperty(fc.jsonValue({ maxDepth: 4 }), async (value) => {
        await renderDiagram(JSON.stringify(value), engine);
      }),
      { numRuns: 300 },
    );
  });

  test('shorthand round-trips through formatShorthand', () => {
    const layer = fc.record(
      {
        units: fc.integer({ min: 1, max: 1_000_000 }),
        activation: fc.constantFrom('relu', 'tanh', 'softmax', 'leaky_relu', 'gelu'),
      },
      { requiredKeys: ['units'] },
    );
    fc.assert(
      fc.property(fc.array(layer, { minLength: 1, maxLength: 30 }), (layers) => {
        const model: Model = { version: 1, layers: layers.map((l) => ({ type: 'dense', ...l })) };
        const text = formatShorthand(model);
        expect(text).toBeDefined();
        expect(parseModel(text!).model).toEqual(model);
      }),
    );
  });
});
