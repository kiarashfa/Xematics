// User colors and outlines per layer kind (style.input / hidden / output) and the animation's
// forward and backward colors: validation, theme resolution, every layout, exports and timelines.

import { describe, expect, test } from 'vitest';
import {
  buildTimeline,
  layoutModel,
  parseModel,
  patchAnimation,
  patchRole,
  prepareModel,
  renderAnimatedSvg,
  renderPdf,
  renderSvg,
  renderTikz,
  resolveTheme,
  roleStroke,
  textOn,
  type Model,
  type Scene,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

async function sceneOf(source: string): Promise<{ model: Model; scene: Scene }> {
  const engine = await getEngine();
  const parsed = parseModel(source);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const model = parsed.model!;
  await prepareModel(model, engine);
  return { model, scene: layoutModel(model, engine).scene };
}

const errorsOf = (source: string) =>
  parseModel(source)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.message);

describe('validation', () => {
  test('accepts fill, outline, weight and dashes per layer kind', () => {
    expect(
      errorsOf(
        "layers: 3-4-2\nstyle:\n  input: { fill: '#abc', outline: '#112233', weight: 0, dashes: dotted }\n  hidden: { dashes: dash-dot }\n  output: { weight: 20 }\nanimation: { forward: '#00ff00', backward: '#f00' }",
      ),
    ).toEqual([]);
  });

  test.each([
    ["style:\n  hidden: { fill: 'red' }", 'hex color'],
    ["style:\n  hidden: { outline: '#12345' }", 'hex color'],
    ['style:\n  hidden: { weight: 21 }', 'at most 20'],
    ['style:\n  hidden: { weight: -1 }', 'at least 0'],
    ['style:\n  hidden: { dashes: wavy }', 'solid, dashed, dotted, dash-dot'],
    ["style:\n  hidden: { text: '#000000' }", ''],
    ["animation: { forward: 'blue' }", 'hex color'],
  ])('rejects %s', (style, message) => {
    const errors = errorsOf(`layers: 3-4-2\n${style}`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toContain(message);
  });
});

describe('theme', () => {
  test('user colors replace the preset role colors, short hex expanded', () => {
    const theme = resolveTheme({ hidden: { fill: '#ABC', outline: '#123456' } });
    expect(theme.roles.hidden.fill).toBe('#aabbcc');
    expect(theme.roles.hidden.stroke).toBe('#123456');
    expect(theme.roles.input).toBe(resolveTheme(undefined).roles.input);
  });

  test('colors stay when the preset changes', () => {
    const theme = resolveTheme({ preset: 'mono', output: { fill: '#e69f00' } });
    expect(theme.roles.output.fill).toBe('#e69f00');
    expect(theme.roles.output.stroke).toBe('#000000');
  });

  test('node text follows the fill: dark on light, white on dark', () => {
    expect(resolveTheme({ hidden: { fill: '#1f2937' } }).roles.hidden.text).toBe('#ffffff');
    expect(resolveTheme({ hidden: { fill: '#fff8dd' } }).roles.hidden.text).toBe('#1f2937');
    // Mono's output text is white; a light fill turns it dark.
    expect(resolveTheme({ preset: 'mono', output: { fill: '#eeeeee' } }).roles.output.text).toBe(
      '#1f2937',
    );
    expect(textOn('#000000', '#ffffff')).toBe('#ffffff');
    // An outline alone keeps the preset's text.
    expect(resolveTheme({ hidden: { outline: '#000000' } }).roles.hidden.text).toBe(
      resolveTheme(undefined).roles.hidden.text,
    );
  });

  test('weight scales the drawn width; 0 hides the outline; dashes follow the width', () => {
    const plain = resolveTheme(undefined);
    expect(roleStroke(plain, 'hidden', 1.5)).toEqual({ stroke: '#4b5563', strokeWidth: 1.5 });
    const heavy = resolveTheme({ hidden: { weight: 3, dashes: 'dashed' } });
    expect(roleStroke(heavy, 'hidden', 1.5)).toEqual({
      stroke: '#4b5563',
      strokeWidth: 3,
      dash: [9, 6],
    });
    // Shapes drawn thinner by default keep their proportion.
    expect(roleStroke(heavy, 'hidden', 1.2).strokeWidth).toBeCloseTo(2.4);
    expect(roleStroke(resolveTheme({ hidden: { weight: 0 } }), 'hidden', 1.5)).toEqual({
      stroke: 'none',
    });
    const dotted = resolveTheme({ input: { dashes: 'dotted' } });
    expect(roleStroke(dotted, 'input', 1.5).dash).toEqual([1.5, 2.25]);
    const dashDot = resolveTheme({ input: { dashes: 'dash-dot', weight: 0.5 } });
    expect(roleStroke(dashDot, 'input', 1.5).dash).toEqual([3, 1.5, 1, 1.5]);
    expect(roleStroke(resolveTheme({ input: { dashes: 'solid' } }), 'input', 1.5).dash).toBe(
      undefined,
    );
  });
});

describe('every layout uses the role colors and outlines', () => {
  const style = "style:\n  hidden: { fill: '#c0ffee', outline: '#123456', dashes: dashed }";
  test.each([
    ['mlp', 'layers: 3-4-4-2'],
    ['boxes', 'layers: 3-40-2\nstyle:\n  preset: boxes'],
    ['cnn', 'layers: in(28x28x1)-conv(8,3x3)-pool(2)-flatten-fc(16)-fc(4)'],
    ['rnn', 'layers: seq(20x8)-lstm(16)-fc(4)'],
    ['rnn neurons', 'layers: seq(20x8)-lstm(4)-fc(2)\nstyle:\n  recurrent: neurons'],
    ['transformer', 'layers: tokens(16)-embed(32)-encoder(2,4)-fc(4)'],
    ['gan', 'layers: gan(16-32 | 32-16)'],
    ['autoencoder', 'layers: ae(8-4-2)'],
  ])('%s', async (_name, layers) => {
    const merged = layers.includes('style:')
      ? `${layers}\n  hidden: { fill: '#c0ffee', outline: '#123456', dashes: dashed }`
      : `${layers}\n${style}`;
    const { scene } = await sceneOf(merged);
    const svg = renderSvg(scene);
    expect(svg).toContain('#c0ffee');
    expect(svg).toContain('#123456');
    expect(svg).toContain('stroke-dasharray');
  });

  test('weight 0 draws the shapes without an outline', async () => {
    const { scene } = await sceneOf('layers: 3-4-2\nstyle:\n  output: { weight: 0 }');
    const outputs = scene.items.filter((i) => i.classes?.includes('node-output'));
    expect(outputs.length).toBe(2);
    for (const node of outputs) expect('paint' in node && node.paint?.stroke).toBe('none');
  });
});

describe('exports', () => {
  test('TikZ writes every dash pair; PDF writes the dash array', async () => {
    const { scene } = await sceneOf('layers: 3-4-2\nstyle:\n  hidden: { dashes: dash-dot }');
    expect(renderTikz(scene)).toMatch(/dash pattern=on [\d.]+pt off [\d.]+pt on [\d.]+pt off/);
    const pdf = String.fromCharCode(...renderPdf(scene));
    expect(pdf).toMatch(/\[4\.5 2\.25 1\.5 2\.25\] 0 d/);
  });

  test('TikZ defines user colors as six-digit HTML colors', async () => {
    const { scene } = await sceneOf("layers: 3-4-2\nstyle:\n  input: { fill: '#abc' }");
    expect(renderTikz(scene)).toContain('{HTML}{AABBCC}');
  });
});

describe('animation colors', () => {
  test('forward and backward colors replace the preset ones in every look', async () => {
    const { model, scene } = await sceneOf(
      "layers: 3-4-2\nanimation: { forward: '#00aa00', backward: '#AA00AA' }",
    );
    for (const look of ['pulse', 'flow', 'dots', 'training'] as const) {
      const svg = renderAnimatedSvg(
        scene,
        buildTimeline(scene, resolveTheme(model.style), { ...model.animation, look }),
      );
      expect(svg).toContain('#00aa00');
      expect(svg).toContain('#aa00aa');
      // Training keeps the preset's weight colors on the connections.
      if (look !== 'training') expect(svg).not.toContain('#d55e00');
    }
  });

  test('training rings show on nodes without an outline and are solid on dashed ones', async () => {
    const { model, scene } = await sceneOf(
      'layers: 3-4-2\nstyle:\n  hidden: { weight: 0 }\n  output: { dashes: dashed }',
    );
    const timeline = buildTimeline(scene, resolveTheme(model.style), { look: 'training' });
    const hidden = timeline.tracks.find((t) => t.target === 'node-1-0')!;
    const widths = hidden.keyframes.map((k) => k.props.strokeWidth ?? 0);
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(3);
    const output = timeline.tracks.find((t) => t.target === 'node-2-0')!;
    expect(output.keyframes.some((k) => k.props.dash?.length === 0)).toBe(true);
    expect(output.keyframes[0]!.props.dash?.length).toBeGreaterThan(0);
  });
});

describe('editing', () => {
  test('patchRole merges, drops solid dashes and empty blocks', () => {
    const model = parseModel('layers: 3-4-2').model!;
    const a = patchRole(model, 'hidden', { fill: '#ffffff' });
    expect(a.style).toEqual({ hidden: { fill: '#ffffff' } });
    const b = patchRole(a, 'hidden', { dashes: 'dashed', weight: 2 });
    expect(b.style).toEqual({ hidden: { fill: '#ffffff', dashes: 'dashed', weight: 2 } });
    const c = patchRole(b, 'hidden', { dashes: 'solid', fill: undefined, weight: undefined });
    expect(c.style).toBeUndefined();
  });

  test('patchAnimation keeps colors and drops them when unset', () => {
    const model = parseModel('layers: 3-4-2').model!;
    const a = patchAnimation(model, { forward: '#00ff00' });
    expect(a.animation).toEqual({ forward: '#00ff00' });
    expect(patchAnimation(a, { forward: undefined }).animation).toBeUndefined();
  });
});
