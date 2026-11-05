import { describe, expect, test } from 'vitest';
import { formatShorthand, parseModel, parseShorthand, type Model } from '../src/index.ts';

const sizes = (text: string) =>
  parseShorthand(text).layers.map((layer) => ('units' in layer ? layer.units : 0));

describe('parseShorthand', () => {
  test.each([
    ['784-16-16-10', [784, 16, 16, 10]],
    ['784, 128, 10', [784, 128, 10]],
    ['784 128 10', [784, 128, 10]],
    ['  1 - 8 - 6 - 2  ', [1, 8, 6, 2]],
    ['dense(64)-FC(10)', [64, 10]],
    ['linear( 3 ),2', [3, 2]],
    ['5', [5]],
  ])('%s', (text, expected) => {
    expect(parseShorthand(text).diagnostics).toEqual([]);
    expect(sizes(text)).toEqual(expected);
  });

  test('activations', () => {
    expect(parseShorthand('4-8:relu-3:softmax').layers).toEqual([
      { type: 'dense', units: 4 },
      { type: 'dense', units: 8, activation: 'relu' },
      { type: 'dense', units: 3, activation: 'softmax' },
    ]);
    expect(parseShorthand('dense(64):leaky_relu').layers[0]).toMatchObject({
      activation: 'leaky_relu',
    });
  });

  test.each([
    ['', 1, 'shorthand.empty'],
    ['784--10', 5, 'shorthand.expected-size'],
    ['784-16x', 7, 'shorthand.unexpected'],
    ['784-', 4, 'shorthand.trailing-separator'],
    ['0-5', 1, 'shorthand.size-range'],
    ['1-2000000', 3, 'shorthand.size-range'],
    ['3.5-2', 2, 'shorthand.size-whole'],
    ['relu-3', 1, 'shorthand.unknown-word'],
    ['lstm(16)-10', 1, 'shorthand.unknown-type'],
    ['conv(16)-10', 6, 'shorthand.expected-kernel'],
    ['dense()', 7, 'shorthand.expected-size'],
    ['dense(4', 8, 'shorthand.expected-paren'],
    ['4:', 3, 'shorthand.expected-activation'],
    ['4;5', 2, 'shorthand.unexpected'],
  ])('error for %j at column %i', (text, column, code) => {
    const { layers, diagnostics } = parseShorthand(text);
    expect(layers).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code, line: 1, column });
  });

  test('error messages are human readable and free of em-dashes', () => {
    const { diagnostics } = parseShorthand('784-16x');
    expect(diagnostics[0]?.message).toBe(
      "Unexpected 'x' after 16. Put a colon before an activation, like 16:relu.",
    );
    expect(diagnostics[0]?.message).not.toContain('\u2014');
  });

  test('columns account for leading whitespace when parsed as a whole input', () => {
    expect(parseModel('   784-').diagnostics[0]).toMatchObject({ line: 1, column: 7 });
    expect(parseModel('\n\n  5-x').diagnostics[0]).toMatchObject({ line: 3, column: 5 });
  });
});

describe('formatShorthand', () => {
  test('round-trips simple models', () => {
    const model: Model = {
      version: 1,
      layers: [
        { type: 'dense', units: 784 },
        { type: 'dense', units: 16, activation: 'relu' },
        { type: 'dense', units: 10, activation: 'softmax' },
      ],
    };
    expect(formatShorthand(model)).toBe('784-16:relu-10:softmax');
    expect(parseModel('784-16:relu-10:softmax').model).toEqual(model);
  });

  test('returns undefined when the shorthand cannot express the model', () => {
    const layers = [{ type: 'dense' as const, units: 3 }];
    expect(formatShorthand({ version: 1, title: 'T', layers })).toBeUndefined();
    expect(
      formatShorthand({ version: 1, layers: [{ type: 'dense', units: 3, name: 'In' }] }),
    ).toBeUndefined();
    expect(formatShorthand({ version: 1, layers, style: { preset: 'classic' } })).toBeUndefined();
  });
});

describe('repeats', () => {
  test.each([
    ['784-128*3-10', [784, 128, 128, 128, 10]],
    ['784 - 128 * 2 - 10', [784, 128, 128, 10]],
    ['4*1-2', [4, 2]],
    ['16:relu*2', [16, 16]],
  ])('%s', (text, expected) => {
    expect(parseShorthand(text).diagnostics).toEqual([]);
    expect(sizes(text)).toEqual(expected);
  });

  test('repeat typed layers with their activation', () => {
    const { layers } = parseShorthand('in(28x28)-conv(8,3x3):relu*2-flatten*1-fc(10)');
    expect(layers.map((l) => l.type)).toEqual(['input', 'conv', 'conv', 'flatten', 'dense']);
    expect(layers[2]).toEqual({ type: 'conv', filters: 8, kernel: 3, activation: 'relu' });
  });

  test.each([
    ['784-128*-10', 'shorthand.expected-count', 9],
    ['784-128*0-10', 'shorthand.size-range', 9],
    ['784-128*999', 'shorthand.size-range', 9],
    ['784-128*3x', 'shorthand.unexpected', 10],
    ['784-128*2.5', 'shorthand.size-whole', 10],
  ])('%s fails with %s', (text, code, column) => {
    expect(parseShorthand(text).diagnostics[0]).toMatchObject({ code, column });
  });

  test('repeats count toward the layer limit', () => {
    expect(parseShorthand('2*128-2*128').diagnostics).toEqual([]);
    expect(parseShorthand('2*128-2*129').diagnostics[0]?.code).toBe('shorthand.too-many');
  });

  test('formatShorthand folds runs only when asked', () => {
    const model = parseModel('784-128*3-10-10:relu-10').model!;
    expect(formatShorthand(model)).toBe('784-128-128-128-10-10:relu-10');
    expect(formatShorthand(model, { repeat: true })).toBe('784-128*3-10-10:relu-10');
  });
});
