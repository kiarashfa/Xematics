// Animations: timelines for every look, the animated SVG export, still frames, the weights style
// and the GIF writer.

import { describe, expect, test } from 'vitest';
import {
  buildTimeline,
  encodeGif,
  formatShorthand,
  layoutModel,
  parseModel,
  prepareModel,
  renderAnimatedSvg,
  renderTikz,
  resolveTheme,
  sampleScene,
  toYaml,
  type AnimationOptions,
  type Scene,
} from '../src/index.ts';
import { getEngine } from './helpers.ts';

const MLP =
  'layers:\n  - { units: 3, name: Input }\n  - { units: 5, activation: relu }\n  - { units: 4, activation: relu }\n  - { units: 2, name: Output }';
const CNN = 'in(28x28x1)-conv(8,3x3):relu-pool(2)-flatten-fc(16)-fc(4)';

async function sceneOf(source: string): Promise<{ scene: Scene; text: string }> {
  const engine = await getEngine();
  const model = parseModel(source).model!;
  await prepareModel(model, engine);
  return { scene: layoutModel(model, engine).scene, text: source };
}

async function animated(source: string, animation: AnimationOptions) {
  const { scene } = await sceneOf(source);
  const timeline = buildTimeline(scene, resolveTheme(undefined), animation);
  return { scene, timeline, svg: renderAnimatedSvg(scene, timeline) };
}

describe('animated SVG goldens', () => {
  test.each<[string, string, AnimationOptions]>([
    ['anim-pulse', MLP, { look: 'pulse', scene: 'both' }],
    ['anim-flow-cnn', CNN, { look: 'flow', scene: 'forward' }],
    ['anim-dots', MLP, { look: 'dots', scene: 'backward' }],
    ['anim-learning', MLP, { look: 'learning' }],
    ['anim-training', MLP, { look: 'training' }],
    ['anim-training-gray', MLP, { look: 'training', grayHidden: true, speed: 2 }],
  ])('%s', async (name, source, animation) => {
    const { svg } = await animated(source, animation);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    await expect(svg).toMatchFileSnapshot(`./golden/${name}.svg`);
  });
});

describe('timelines', () => {
  test('every track targets a scene item and runs from 0 to 1 with the same properties', async () => {
    for (const look of ['pulse', 'flow', 'dots', 'learning', 'training'] as const) {
      const { scene, timeline } = await animated(CNN, { look });
      const ids = new Set([...scene.items, ...timeline.extras].map((i) => i.id));
      expect(timeline.tracks.length).toBeGreaterThan(0);
      for (const track of timeline.tracks) {
        expect(ids.has(track.target)).toBe(true);
        const frames = track.keyframes;
        expect(frames[0]!.at).toBe(0);
        expect(frames.at(-1)!.at).toBe(1);
        for (let i = 1; i < frames.length; i++)
          expect(frames[i]!.at).toBeGreaterThan(frames[i - 1]!.at);
        const keys = Object.keys(frames[0]!.props).sort().join();
        for (const frame of frames) expect(Object.keys(frame.props).sort().join()).toBe(keys);
      }
    }
  });

  test('speed and loop change the timing', async () => {
    const normal = await animated(MLP, { look: 'pulse' });
    const fast = await animated(MLP, { look: 'pulse', speed: 2 });
    expect(fast.timeline.duration).toBe(Math.round(normal.timeline.duration / 2));
    expect(normal.svg).toContain('linear infinite');
    expect((await animated(MLP, { look: 'pulse', loop: false })).svg).toContain(
      'linear 1 forwards',
    );
  });

  test('training takes 4 seconds per example; gray hidden layers keep their fill', async () => {
    const { timeline } = await animated(MLP, { look: 'training', grayHidden: true });
    expect(timeline.duration).toBe(20_000);
    const hidden = timeline.tracks.find((t) => t.target === 'node-1-0')!;
    const fills = new Set(hidden.keyframes.map((k) => k.props.fill));
    expect([...fills]).toEqual(['#f1f2f4']);
    const output = timeline.tracks.find((t) => t.target === 'node-3-0')!;
    expect(new Set(output.keyframes.map((k) => k.props.fill)).size).toBeGreaterThan(1);
  });

  test('the animation is the same every time', async () => {
    const a = await animated(CNN, { look: 'training' });
    const b = await animated(CNN, { look: 'training' });
    expect(a.svg).toBe(b.svg);
  });
});

describe('still frames', () => {
  test('frame 0 of a signal look is the still figure; mid-flash shows the signal color', async () => {
    const { scene, timeline } = await animated(MLP, { look: 'pulse', scene: 'forward' });
    const still = sampleScene(scene, timeline, 0);
    const node = (s: Scene) => s.items.find((i) => i.id === 'node-0-0');
    expect(node(still)).toEqual(node(scene));
    const lit = sampleScene(scene, timeline, 300);
    const litNode = node(lit);
    expect(litNode && 'paint' in litNode ? litNode.paint.stroke : '').toBe('#0072b2');
  });

  test('dots move along their connection', async () => {
    const { scene, timeline } = await animated(MLP, { look: 'dots', scene: 'forward' });
    expect(timeline.extras.some((i) => i.id === 'signal-0')).toBe(true);
    const dot = (ms: number) =>
      sampleScene(scene, timeline, ms).items.find((i) => i.id === 'signal-0');
    const [a, b] = [dot(300), dot(700)];
    if (a?.kind !== 'circle' || b?.kind !== 'circle') throw new Error('no dot');
    expect(b.cx).toBeGreaterThan(a.cx);
    expect(a.paint.opacity).toBe(1);
  });
});

describe('animation option in the source', () => {
  test('validates, suggests keys and stays out of the shorthand', () => {
    const ok = parseModel(
      'layers: [3, 2]\nanimation: { look: training, speed: 0.5, grayHidden: true }',
    );
    expect(ok.model?.animation).toEqual({ look: 'training', speed: 0.5, grayHidden: true });
    expect(formatShorthand(ok.model!)).toBeUndefined();
    expect(toYaml(ok.model!)).toContain(
      'animation: { look: training, speed: 0.5, grayHidden: true }',
    );
    const bad = parseModel('layers: [3, 2]\nanimation: { lok: pulse }');
    expect(bad.diagnostics[0]?.message).toContain("Did you mean 'look'?");
    expect(parseModel('layers: [3, 2]\nanimation: { speed: 9 }').diagnostics[0]?.message).toContain(
      'at most 4',
    );
  });
});

describe('weights style', () => {
  test('connections take a seeded weight; TikZ keeps each width and opacity', async () => {
    const { scene } = await sceneOf(`layers: [3, 4, 2]\nstyle: { weights: true }`);
    const edges = scene.items.filter((i) => i.kind === 'line' && i.id.startsWith('edge-'));
    expect(edges.every((e) => e.classes?.some((c) => c.startsWith('weight-')))).toBe(true);
    expect(new Set(edges.map((e) => ('paint' in e ? e.paint.stroke : ''))).size).toBe(2);
    const tex = renderTikz(scene);
    expect(tex).toMatch(
      /\\draw\[xm weight (positive|negative), line width=[\d.]+pt, opacity=[\d.]+\]/,
    );
  });
});

describe('GIF writer', () => {
  /** Minimal GIF reader: the palette and the color indices of every frame. */
  function decode(bytes: Uint8Array) {
    const text = String.fromCharCode(...bytes.slice(0, 6));
    let p = 13 + 256 * 3;
    const palette = bytes.slice(13, p);
    const frames: number[][] = [];
    let loops = false;
    while (bytes[p] !== 0x3b) {
      if (bytes[p] === 0x21) {
        if (bytes[p + 1] === 0xff) loops = true;
        p += 2;
        while (bytes[p] !== 0) p += bytes[p]! + 1;
        p++;
        continue;
      }
      expect(bytes[p]).toBe(0x2c);
      p += 10;
      const min = bytes[p++]!;
      const data: number[] = [];
      while (bytes[p] !== 0) {
        const n = bytes[p++]!;
        data.push(...bytes.slice(p, p + n));
        p += n;
      }
      p++;
      // LZW decode.
      const clear = 1 << min;
      let size = min + 1;
      let dict: number[][] = [];
      const reset = () => {
        dict = Array.from({ length: clear + 2 }, (_, i) => [i]);
        size = min + 1;
      };
      reset();
      let bit = 0;
      const read = () => {
        let code = 0;
        for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3]! >> (bit & 7)) & 1) << i;
        return code;
      };
      const out: number[] = [];
      let prev: number[] | undefined;
      for (;;) {
        const code = read();
        if (code === clear) {
          reset();
          prev = undefined;
          continue;
        }
        if (code === clear + 1) break;
        const entry = dict[code] ?? [...prev!, prev![0]!];
        out.push(...entry);
        if (prev) dict.push([...prev, entry[0]!]);
        prev = entry;
        if (dict.length === 1 << size && size < 12) size++;
      }
      frames.push(out);
    }
    return { text, palette, frames, loops };
  }

  test('writes a looping GIF89a that decodes back to the frames', () => {
    const width = 40;
    const height = 30;
    const frame = (shift: number) => {
      const rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        const on = ((i % width) + shift) % 10 < 5;
        rgba.set(on ? [0, 114, 178, 255] : [255, 255, 255, 255], i * 4);
      }
      return rgba;
    };
    const frames = [frame(0), frame(3), frame(6)];
    const gif = encodeGif(frames, { width, height, delay: 100 });
    expect(gif).toEqual(encodeGif(frames, { width, height, delay: 100 }));
    const decoded = decode(gif);
    expect(decoded.text).toBe('GIF89a');
    expect(decoded.loops).toBe(true);
    expect(decoded.frames).toHaveLength(3);
    decoded.frames.forEach((indices, f) => {
      expect(indices).toHaveLength(width * height);
      indices.forEach((index, i) => {
        const color = [...decoded.palette.slice(index * 3, index * 3 + 3)];
        expect(color).toEqual([...frames[f]!.slice(i * 4, i * 4 + 3)]);
      });
    });
  });

  test('a long frame uses the full 12-bit code range', () => {
    const width = 300;
    const height = 200;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = (i * 7919) % 251;
      rgba.set([v, (v * 3) % 256, (v * 5) % 256, 255], i * 4);
    }
    const decoded = decode(encodeGif([rgba], { width, height, delay: 50, loop: false }));
    expect(decoded.loops).toBe(false);
    expect(decoded.frames[0]).toHaveLength(width * height);
  });
});
