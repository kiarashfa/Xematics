// Animation timelines: keyframed paint changes on scene items, targeted by their stable ids.
// One timeline feeds three outputs: CSS keyframes in exported SVG (css.ts), the editor's player
// (Web Animations), and frames for GIF and WebM (sample.ts). Deterministic numbers only.
//
// Looks:
//   pulse     layers light up in turn; connections between them flash
//   flow      the same, with dashes running along the connections
//   dots      a dot travels along every connection
//   learning  connection weights drift from random to learned (sign = color, strength = width)
//   training  a loop of examples: forward wave, backward wave, then a weight update

import type { AnimationLook, AnimationOptions, AnimationScene } from '../model/schema.ts';
import type { CircleItem, Paint, Scene, SceneItem } from '../scene.ts';
import type { Theme } from '../style/theme.ts';
import { edgeWeight, mixColor, seeded, hash, weightPaint } from './random.ts';

/** Paint values a keyframe can set. `tx`/`ty` move an item (the signal dots). */
export interface Props {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly strokeOpacity?: number;
  readonly opacity?: number;
  /** Dash pattern; an empty list is a solid line. */
  readonly dash?: readonly number[];
  readonly dashOffset?: number;
  readonly tx?: number;
  readonly ty?: number;
}

export interface Keyframe {
  /** Position in the loop, 0 to 1. */
  readonly at: number;
  readonly props: Props;
}

export interface Track {
  readonly target: string;
  /** Sorted by `at`, from 0 to 1, every keyframe setting the same properties. */
  readonly keyframes: readonly Keyframe[];
}

export interface Timeline {
  readonly duration: number;
  readonly loop: boolean;
  readonly tracks: readonly Track[];
  /** Items the animation adds to the scene (the signal dots), painted last. */
  readonly extras: readonly SceneItem[];
}

export interface ResolvedAnimation {
  readonly look: AnimationLook;
  readonly scene: AnimationScene;
  readonly speed: number;
  readonly loop: boolean;
  readonly grayHidden: boolean;
}

export function resolveAnimation(options: AnimationOptions | undefined): ResolvedAnimation {
  return {
    look: options?.look ?? 'pulse',
    scene: options?.scene ?? 'both',
    speed: options?.speed ?? 1,
    loop: options?.loop ?? true,
    grayHidden: options?.grayHidden ?? false,
  };
}

const STEP = 700; // ms per layer for the signal looks
const PAUSE = 900;
const LEARNING_PERIOD = 7000;
const EXAMPLES = 5;
const EXAMPLE_SLOT = 4000; // ms per training example

type Role = 'node' | 'link' | 'window' | 'head';
interface Part {
  readonly item: SceneItem;
  readonly layer: number;
  readonly role: Role;
}

const index = (id: string) => Number(id.split('-')[1]);

/** The layer each animated item belongs to, and what kind of part it is. */
function partsOf(scene: Scene): { parts: Part[]; layers: number } {
  const byId = new Map(scene.items.map((i) => [i.id, i]));
  const parts: Part[] = [];
  let layers = 0;
  for (const item of scene.items) {
    if (item.kind === 'group' && item.id.startsWith('layer-'))
      layers = Math.max(layers, index(item.id) + 1);
    if (item.kind === 'group' || item.kind === 'text' || item.kind === 'math') continue;
    if (item.parent?.startsWith('ellipsis-')) continue;
    let role: Role | undefined;
    if (item.id.startsWith('node-') || item.id.startsWith('sheet-') || item.id.startsWith('box-'))
      role = 'node';
    else if (/^(edge|fan|ray|arrow)-/.test(item.id) && item.kind === 'line') role = 'link';
    else if (item.id.startsWith('window-')) role = 'window';
    else if (item.id.endsWith('-head') && item.id.startsWith('arrow-')) role = 'head';
    if (!role) continue;
    let layer: number | undefined;
    for (let cur: SceneItem | undefined = item; cur && layer === undefined;) {
      if (cur.id.startsWith('layer-')) layer = index(cur.id);
      else if (cur.id.startsWith('edges-')) layer = index(cur.id);
      else if (cur.id.startsWith('rays-')) layer = index(cur.id) - 1;
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    if (layer !== undefined) parts.push({ item, layer, role });
  }
  return { parts, layers };
}

const paintOf = (item: SceneItem): Paint => ('paint' in item ? item.paint : {});

/** Keyframes from (time, props) stops: sorted, clamped to [0, 1], starting at 0 and ending at 1. */
function track(target: string, stops: [number, Props][]): Track {
  const sorted = stops
    .map(([at, props]): Keyframe => ({
      at: Math.min(1, Math.max(0, Math.round(at * 1e5) / 1e5)),
      props,
    }))
    .sort((a, b) => a.at - b.at);
  const out: Keyframe[] = [];
  for (const frame of sorted) {
    const last = out.at(-1);
    if (last && last.at === frame.at) out[out.length - 1] = frame;
    else out.push(frame);
  }
  if (out[0]!.at > 0) out.unshift({ at: 0, props: out[0]!.props });
  if (out.at(-1)!.at < 1) out.push({ at: 1, props: out.at(-1)!.props });
  return { target, keyframes: out };
}

export function buildTimeline(
  scene: Scene,
  theme: Theme,
  options: AnimationOptions | undefined,
): Timeline {
  const anim = resolveAnimation(options);
  const { parts, layers } = partsOf(scene);
  const built =
    anim.look === 'learning'
      ? learning(parts, theme)
      : anim.look === 'training'
        ? training(parts, layers, theme, anim.grayHidden)
        : signal(parts, layers, theme, anim);
  return { ...built, duration: Math.round(built.duration / anim.speed), loop: anim.loop };
}

type Built = { duration: number; tracks: Track[]; extras: SceneItem[] };

function signal(parts: Part[], layers: number, theme: Theme, anim: ResolvedAnimation): Built {
  const forwardEnd = layers * STEP;
  const span = anim.scene === 'both' ? 2 * forwardEnd : forwardEnd;
  const total = span + PAUSE;
  const { forward, backward, grayBorder } = theme.motion;
  /** Active windows (ms) for a layer's nodes, or for the links out of it. */
  const windows = (layer: number, link: boolean) => {
    const out: { start: number; end: number; color: string; dir: 1 | -1 }[] = [];
    const length = STEP * (link ? 0.75 : 1.1);
    const shift = link ? STEP * 0.35 : 0;
    if (anim.scene !== 'backward') {
      const f = layer * STEP + shift;
      out.push({ start: f, end: f + length, color: forward, dir: 1 });
    }
    if (anim.scene !== 'forward') {
      const origin = anim.scene === 'both' ? forwardEnd : 0;
      const b = origin + (layers - 1 - (link ? layer + 1 : layer)) * STEP + shift;
      out.push({ start: b, end: b + length, color: backward, dir: -1 });
    }
    return out;
  };

  const tracks: Track[] = [];
  const extras: SceneItem[] = [];
  for (const { item, layer, role } of parts) {
    const paint = paintOf(item);
    const hidden = role === 'node' && layer > 0 && layer < layers - 1;
    const width = paint.strokeWidth ?? 1;
    let base: Props;
    let active: (color: string, dir: 1 | -1, k: 0 | 1) => Props;
    if (role === 'node') {
      base = { fill: paint.fill ?? 'none', stroke: paint.stroke ?? 'none', strokeWidth: width };
      active = (color) =>
        hidden && anim.grayHidden
          ? { fill: base.fill!, stroke: grayBorder, strokeWidth: width * 1.9 }
          : {
              fill: paint.fill
                ? mixColor(paint.fill, color, anim.look === 'pulse' ? 0.45 : 0.25)
                : 'none',
              stroke: color,
              strokeWidth: width * 1.9,
            };
    } else if (role === 'window') {
      base = { fill: paint.fill ?? 'none', stroke: paint.stroke ?? 'none', strokeWidth: width };
      active = (color) => ({
        fill: mixColor(paint.fill ?? '#ffffff', color, 0.45),
        stroke: color,
        strokeWidth: 1.6,
      });
    } else if (role === 'head') {
      base = { fill: paint.fill ?? 'none' };
      active = (color) => ({ fill: color });
    } else if (anim.look === 'flow') {
      base = { stroke: paint.stroke ?? 'none', strokeWidth: width, dash: [], dashOffset: 0 };
      active = (color, dir, k) => ({
        stroke: color,
        strokeWidth: Math.max(1.3, width * 1.8),
        dash: [3, 4],
        dashOffset: -dir * k * 42,
      });
    } else if (anim.look === 'dots') {
      base = { stroke: paint.stroke ?? 'none', strokeWidth: width };
      active = (color) => ({
        stroke: mixColor(paint.stroke ?? '#999999', color, 0.35),
        strokeWidth: width,
      });
    } else {
      base = { stroke: paint.stroke ?? 'none', strokeWidth: width };
      active = (color) => ({ stroke: color, strokeWidth: Math.max(1.3, width * 1.8) });
    }
    // Weighted connections (style.weights) are faint; a flash shows them at full strength.
    if (role === 'link' && paint.opacity !== undefined) {
      const plain = active;
      base = { ...base, opacity: paint.opacity };
      active = (color, dir, k) => ({ ...plain(color, dir, k), opacity: 1 });
    }
    const stops: [number, Props][] = [
      [0, base],
      [1, base],
    ];
    const isLink = role !== 'node';
    for (const w of windows(layer, isLink)) {
      const s = w.start / total;
      const e = w.end / total;
      if (anim.look === 'flow' && role === 'link') {
        stops.push(
          [s, base],
          [s + 0.0005, active(w.color, w.dir, 0)],
          [e - 0.0005, active(w.color, w.dir, 1)],
          [e, base],
        );
      } else {
        const rise = 0.18 * (e - s);
        stops.push(
          [s, base],
          [s + rise, active(w.color, w.dir, 0)],
          [e - rise, active(w.color, w.dir, 0)],
          [e, base],
        );
      }
      if (anim.look === 'dots' && item.kind === 'line' && role === 'link') {
        const id = `signal-${extras.length}`;
        const [x, y, dx, dy] =
          w.dir === 1
            ? [item.x1, item.y1, item.x2 - item.x1, item.y2 - item.y1]
            : [item.x2, item.y2, item.x1 - item.x2, item.y1 - item.y2];
        const dot: CircleItem = {
          kind: 'circle',
          id,
          parent: 'signal',
          classes: ['signal'],
          cx: x,
          cy: y,
          r: 2.1,
          paint: { fill: w.color, opacity: 0 },
        };
        extras.push(dot);
        const hiddenDot = { opacity: 0, tx: 0, ty: 0 };
        tracks.push(
          track(id, [
            [0, hiddenDot],
            [s, hiddenDot],
            [s + 0.0005, { opacity: 1, tx: 0, ty: 0 }],
            [e - 0.0005, { opacity: 1, tx: dx, ty: dy }],
            [e, { opacity: 0, tx: dx, ty: dy }],
            [1, { opacity: 0, tx: dx, ty: dy }],
          ]),
        );
      }
    }
    tracks.push(track(item.id, stops));
  }
  if (extras.length > 0) extras.unshift({ kind: 'group', id: 'signal', classes: ['signal'] });
  return { duration: total, tracks, extras };
}

function learning(parts: Part[], theme: Theme): Built {
  const TIMES = [0, 0.18, 0.36, 0.54, 0.72, 0.9, 1];
  const { positive, negative } = theme.motion;
  const tracks: Track[] = [];
  for (const { item, role } of parts) {
    if (role !== 'link' || !/^(edge|fan)-/.test(item.id)) continue;
    const { start, learned, next } = edgeWeight(item.id);
    const wobble = () => (next() * 2 - 1) * 0.12;
    const stops = TIMES.map((t, i): [number, Props] => {
      let w = start;
      if (i < TIMES.length - 1) {
        const p = Math.min(1, t / 0.72);
        const eased = 1 - (1 - p) * (1 - p);
        w = start + (learned - start) * eased + (i > 0 && i < 4 ? wobble() : 0);
      }
      return [t, weightPaint(w, positive, negative)];
    });
    tracks.push(track(item.id, stops));
  }
  return { duration: LEARNING_PERIOD, tracks, extras: [] };
}

function training(parts: Part[], layers: number, theme: Theme, grayHidden: boolean): Built {
  const total = EXAMPLES * EXAMPLE_SLOT;
  const { forward: blue, backward: red, positive, negative, grayBorder } = theme.motion;
  const outputs = parts
    .filter((p) => p.role === 'node' && p.layer === layers - 1 && p.item.kind === 'circle')
    .map((p) => Number(p.item.id.split('-')[2]));
  const targetOf = (e: number) =>
    outputs.length > 0 ? outputs[(e * 3 + 2) % outputs.length]! : -1;
  const at = (e: number, f: number) => (e + f) / EXAMPLES;
  const forwardAt = (layer: number) => 0.05 + 0.09 * layer;
  const backStart = forwardAt(layers - 1) + 0.12;
  const backwardAt = (layer: number) => backStart + 0.1 * (layers - 2 - layer);
  const UPDATE = 0.86;
  const RESET = 0.95;

  const tracks: Track[] = [];
  for (const { item, layer, role } of parts) {
    const paint = paintOf(item);
    const width = paint.strokeWidth ?? 1.5;
    if (role === 'node') {
      const fill = paint.fill ?? '#ffffff';
      const stroke = paint.stroke ?? '#4b5563';
      const base: Props = { fill, stroke, strokeWidth: width };
      const isOutput = layer === layers - 1;
      const hidden = layer > 0 && !isOutput;
      const neuron = item.kind === 'circle' ? Number(item.id.split('-')[2]) : -1;
      const random = seeded(hash(item.id));
      const stops: [number, Props][] = [
        [0, base],
        [1, base],
      ];
      for (let e = 0; e < EXAMPLES; e++) {
        const target = isOutput && neuron === targetOf(e);
        const r = random();
        const a = isOutput ? (target ? 0.95 : r * 0.35) : r * r;
        const gray = grayHidden && hidden;
        const lit: Props = {
          fill: gray ? fill : mixColor(fill, blue, 0.1 + 0.8 * a),
          stroke: gray ? grayBorder : stroke,
          strokeWidth: gray ? width * 1.7 : width,
        };
        const ring: Props = {
          fill: lit.fill!,
          stroke: gray ? grayBorder : red,
          strokeWidth: width * 2,
        };
        const on = forwardAt(layer);
        stops.push([at(e, 0.02), base], [at(e, on), base], [at(e, on + 0.05), lit]);
        const reached = target ? backStart - 0.04 : hidden ? backwardAt(layer) + 0.06 : undefined;
        if (reached !== undefined) stops.push([at(e, reached), lit], [at(e, reached + 0.04), ring]);
        stops.push([at(e, RESET), reached !== undefined ? ring : lit], [at(e, 0.99), base]);
      }
      tracks.push(track(item.id, stops));
      continue;
    }
    if (role !== 'link' || item.kind !== 'line') continue;
    const weighted = /^(edge|fan)-/.test(item.id);
    const { start, learned, next } = edgeWeight(item.id);
    const strength = (w: number) => Math.min(1, Math.abs(w));
    const resting = (w: number): Props =>
      weighted
        ? weightPaint(w, positive, negative)
        : {
            stroke: paint.stroke ?? '#999999',
            opacity: paint.opacity ?? 1,
            strokeWidth: paint.strokeWidth ?? 1,
          };
    const flash = (color: string, w: number, strong: boolean): Props => ({
      stroke: color,
      opacity: strong ? 1 : Math.round((0.3 + 0.6 * strength(w)) * 1000) / 1000,
      strokeWidth: strong ? 2.4 : Math.round(Math.max(1, 0.45 + 2.3 * strength(w)) * 100) / 100,
    });
    const parts2 = item.id.split('-');
    const into = (e: number) =>
      item.id.startsWith('edge-') &&
      Number(parts2[3]) === layers - 1 &&
      Number(parts2[4]) === targetOf(e);
    let w = start;
    const stops: [number, Props][] = [[0, resting(w)]];
    for (let e = 0; e < EXAMPLES; e++) {
      const f0 = forwardAt(layer) + 0.02;
      const f1 = forwardAt(layer + 1) + 0.03;
      stops.push(
        [at(e, f0), resting(w)],
        [at(e, f0 + 0.02), flash(blue, w, false)],
        [at(e, f1), flash(blue, w, false)],
        [at(e, f1 + 0.03), resting(w)],
      );
      const b0 = backwardAt(layer);
      const strong = into(e);
      stops.push(
        [at(e, b0), resting(w)],
        [at(e, b0 + 0.02), flash(red, w, strong)],
        [at(e, b0 + 0.08), flash(red, w, strong)],
        [at(e, b0 + 0.11), resting(w)],
      );
      const p = (e + 1) / EXAMPLES;
      const nextWeight =
        start + (learned - start) * (1 - (1 - p) * (1 - p)) + (next() * 2 - 1) * 0.05 * (1 - p);
      stops.push([at(e, UPDATE), resting(w)], [at(e, UPDATE + 0.08), resting(nextWeight)]);
      w = nextWeight;
    }
    stops.push([1, resting(start)]);
    tracks.push(track(item.id, stops));
  }
  return { duration: total, tracks, extras: [] };
}
