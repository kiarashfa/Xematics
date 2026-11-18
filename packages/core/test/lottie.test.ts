// Lottie export: one shape layer, keyframes from the animation timeline.

import { describe, expect, test } from 'vitest';
import {
  buildTimeline,
  layoutModel,
  parseModel,
  prepareModel,
  renderLottie,
  resolveTheme,
  type AnimationOptions,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

const MLP =
  'layers:\n  - { units: 3, name: Input }\n  - { units: 5, activation: relu }\n  - { units: 2, name: Output }';

async function lottieOf(source: string, animation?: AnimationOptions) {
  const engine = await getEngine();
  const model = parseModel(source).model!;
  await prepareModel(model, engine);
  const scene = layoutModel(model, engine).scene;
  const timeline = buildTimeline(scene, resolveTheme(model.style), animation ?? model.animation);
  const text = renderLottie(scene, timeline);
  return { text, json: JSON.parse(text), timeline };
}

type Shape = { ty: string; nm?: string; it?: Shape[]; [key: string]: unknown };
const groups = (json: { layers: { shapes: Shape[] }[] }) => json.layers[0]!.shapes;

describe('Lottie export', () => {
  test('a valid document: size, frames and one shape group per drawn item', async () => {
    const { json, timeline, text } = await lottieOf(MLP);
    expect(json).toMatchObject({ v: '5.7.0', fr: 30, ip: 0, assets: [] });
    expect(json.op).toBe(Math.round((timeline.duration / 1000) * 30));
    expect(groups(json).every((g) => g.ty === 'gr' && g.it!.at(-1)!.ty === 'tr')).toBe(true);
    expect(text).not.toMatch(/NaN|Infinity|null/);
    await expect(text).toMatchFileSnapshot('./golden/anim-pulse.lottie');
  });

  test('nodes are keyframed with increasing times; the first group is drawn on top', async () => {
    const { json } = await lottieOf(MLP, { look: 'pulse' });
    const node = groups(json).find((g) => g.nm === 'node-1-0')!;
    const fill = node.it!.find((s) => s.ty === 'fl') as unknown as {
      c: { a: number; k: { t: number }[] };
    };
    expect(fill.c.a).toBe(1);
    const times = fill.c.k.map((k) => k.t);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    // Labels are painted last in the scene, so they come first here.
    expect(groups(json)[0]!.nm).toMatch(/^(name|size)-/);
  });

  test('flow dashes, moving dots and the loss curve become animated properties', async () => {
    const flow = await lottieOf(MLP, { look: 'flow' });
    const edge = groups(flow.json).find((g) => g.nm?.startsWith('edge-'))!;
    const stroke = edge.it!.find((s) => s.ty === 'st') as unknown as { d: { v: { a: number } }[] };
    expect(stroke.d.map((d) => d.v.a)).toContain(1);
    const dots = await lottieOf(MLP, { look: 'dots' });
    const dot = groups(dots.json).find((g) => g.nm?.startsWith('signal-'))!;
    expect((dot.it!.at(-1) as unknown as { p: { a: number } }).p.a).toBe(1);
    const loss = await lottieOf(`animation: { look: training, loss: true }\n${MLP}`);
    expect(groups(loss.json).some((g) => g.nm === 'loss-line')).toBe(true);
    expect(loss.json.h).toBeGreaterThan(flow.json.h);
  });

  test('the same animation gives the same file', async () => {
    const a = await lottieOf(MLP, { look: 'training' });
    const b = await lottieOf(MLP, { look: 'training' });
    expect(a.text).toBe(b.text);
  });
});
