import { describe, expect, test } from 'vitest';
import { detectFormat, parseModel } from '../src/index.ts';

const errors = (text: string) => parseModel(text).diagnostics.filter((d) => d.severity === 'error');

describe('detectFormat', () => {
  test.each([
    ['784-16-10', 'shorthand'],
    ['dense(4):relu', 'shorthand'],
    ['{"layers": [3, 2]}', 'json'],
    ['  [3, 2]', 'json'],
    ['layers: 3-2', 'yaml'],
    ['3-2 # comment', 'yaml'],
    ['version: 1\nlayers: [3]', 'yaml'],
  ])('%j is %s', (text, format) => {
    expect(detectFormat(text)).toBe(format);
  });
});

describe('parseModel', () => {
  test('full YAML model', () => {
    const { model, format, diagnostics } = parseModel(
      [
        'version: 1',
        'title: Example',
        'layers:',
        '  - { units: 1, name: Input }',
        '  - { type: dense, units: 8, activation: relu, collapse: false }',
        '  - { units: 2, activation: softmax, collapse: { first: 1, last: 1 } }',
        'style: { preset: classic, labels: { sizes: false }, background: transparent }',
      ].join('\n'),
    );
    expect(diagnostics).toEqual([]);
    expect(format).toBe('yaml');
    expect(model).toEqual({
      version: 1,
      title: 'Example',
      layers: [
        { type: 'dense', units: 1, name: 'Input' },
        { type: 'dense', units: 8, activation: 'relu', collapse: false },
        { type: 'dense', units: 2, activation: 'softmax', collapse: { first: 1, last: 1 } },
      ],
      style: { preset: 'classic', labels: { sizes: false }, background: 'transparent' },
    });
  });

  test('version defaults to 1 and layers accept shorthand, numbers and objects', () => {
    expect(parseModel('layers: 784-16-10').model?.layers.map((l) => l.units)).toEqual([
      784, 16, 10,
    ]);
    expect(parseModel('[3, {units: 2, name: Out}]').model?.layers).toEqual([
      { type: 'dense', units: 3 },
      { type: 'dense', units: 2, name: 'Out' },
    ]);
    expect(parseModel('{"layers":[4,{"units":1}]}').format).toBe('json');
    expect(parseModel('layers:\n  - 5\n  - { units: 1, collapse: true }').model?.layers[1]).toEqual(
      {
        type: 'dense',
        units: 1,
      },
    );
  });

  test('unknown keys get a suggestion and a position', () => {
    const [error, ...rest] = errors('layers:\n  - { unit: 4 }');
    expect(rest).toEqual([]);
    expect(error).toMatchObject({ code: 'model.unknown-key', line: 2, column: 7 });
    expect(error?.message).toBe(
      "Layer 1 has an unknown key 'unit'. Did you mean 'units'? Allowed keys: type, units, name, activation, collapse.",
    );
    expect(errors('layer: [3]')[0]?.message).toContain("Did you mean 'layers'?");
    expect(errors('layers: [3]\nstyle: { colapse: { above: 4 } }')[0]?.message).toContain(
      "'style' has an unknown key 'colapse'. Did you mean 'collapse'?",
    );
  });

  test('nested problems inside a union are reported precisely', () => {
    expect(errors('layers:\n  - { units: 4, collapse: { frist: 2 } }')[0]?.message).toContain(
      "Layer 1 'collapse' has an unknown key 'frist'. Did you mean 'first'?",
    );
    expect(errors('layers:\n  - { units: 4, collapse: { first: -1 } }')[0]?.message).toBe(
      "Layer 1: 'collapse.first' must be at least 0.",
    );
    expect(errors('layers:\n  - { units: 4, collapse: yes }')[0]?.message).toBe(
      "Layer 1: 'collapse' must be false or an object like { first: 3, last: 3 }.",
    );
  });

  test('value errors name the layer and key', () => {
    expect(errors('layers:\n  - { units: 0 }')[0]).toMatchObject({
      message: "Layer 1: 'units' must be at least 1.",
      line: 2,
      column: 14,
    });
    expect(errors('layers:\n  - { units: 4.5 }')[0]?.message).toBe(
      "Layer 1: 'units' must be a whole number.",
    );
    expect(errors('layers:\n  - { type: conv, units: 4 }')[0]?.message).toBe(
      "Layer 1: 'type' 'conv' is not supported yet. Supported layer types: dense.",
    );
    expect(errors('layers:\n  - { name: x }')[0]?.message).toBe("Layer 1 is missing 'units'.");
    expect(errors('layers: []')[0]?.message).toBe("'layers' must contain at least one layer.");
    expect(errors("layers: [3]\nstyle: { background: '#12' }")[0]?.message).toContain('hex color');
    // An unquoted # starts a YAML comment, leaving the value empty.
    expect(errors('layers: [3]\nstyle: { background: #fff }').length).toBeGreaterThan(0);
  });

  test('versions and limits', () => {
    expect(errors('version: 2\nlayers: [3]')[0]?.message).toBe(
      'This diagram uses format version 2, which needs a newer version of Xematics.',
    );
    expect(errors('version: 0\nlayers: [3]')[0]?.message).toBe("'version' must be 1.");
    expect(errors(`[${Array(257).fill(1).join(',')}]`)[0]?.message).toContain('at most 256 layers');
    expect(errors('x'.repeat(200_001))[0]?.code).toBe('input.too-long');
  });

  test('YAML syntax errors carry positions', () => {
    const [duplicate] = errors('layers: [3]\nlayers: [4]');
    expect(duplicate).toMatchObject({ code: 'yaml.duplicate_key', line: 2, column: 1 });
    expect(errors('layers:\n  - 3\n - 4')[0]?.line).toBe(3);
  });

  test('alias bombs are rejected', () => {
    const bomb = [
      'a: &a [x, x, x, x, x, x, x, x, x, x]',
      ...'bcdefgh'
        .split('')
        .map((k, i) => `${k}: &${k} [${Array(10).fill(`*${'abcdefgh'[i]}`).join(', ')}]`),
      'layers: *h',
    ].join('\n');
    expect(errors(bomb).length).toBeGreaterThan(0);
  });
});
