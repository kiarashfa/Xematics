// Lottie export: the animated figure as a Lottie (Bodymovin) JSON file, for apps and web pages
// that play Lottie. One shape layer holds every item of the animated scene as a group (text and
// formulas are already outlines); the timeline's keyframes become Lottie keyframes. Output is
// deterministic: rounded numbers, no timestamps.

import { animatedScene } from '../animate/css.ts';
import type { Props, Timeline } from '../animate/timeline.ts';
import type { Paint, Scene, SceneItem } from '../scene.ts';
import { parsePath } from '../text/math.ts';

export interface LottieOptions {
  /** Frames per second (default 30). */
  readonly fps?: number;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** A solid line, written as one dash longer than any figure with no gap. */
const SOLID: readonly number[] = [100000, 0];

function rgba(color: string | undefined): number[] | undefined {
  if (!color || color === 'none' || !color.startsWith('#')) return undefined;
  const hex =
    color.length === 4 ? [...color.slice(1)].map((c) => c + c).join('') : color.slice(1, 7);
  return [0, 2, 4].map((i) => r4(parseInt(hex.slice(i, i + 2), 16) / 255)).concat(1);
}

/** Lottie bezier shapes ("sh") from SVG path data: one per subpath. */
function bezierShapes(d: string): Json[] {
  const out: Json[] = [];
  let v: number[][] = [];
  let ins: number[][] = [];
  let outs: number[][] = [];
  let closed = false;
  const flush = () => {
    if (v.length > 1) {
      out.push({ ty: 'sh', ks: { a: 0, k: { c: closed, v, i: ins, o: outs } } });
    }
    v = [];
    ins = [];
    outs = [];
    closed = false;
  };
  let x = 0;
  let y = 0;
  for (const cmd of parsePath(d)) {
    const n = cmd.values;
    if (cmd.type === 'M') {
      flush();
      [x, y] = [n[0]!, n[1]!];
      v.push([r2(x), r2(y)]);
      ins.push([0, 0]);
      outs.push([0, 0]);
    } else if (cmd.type === 'L') {
      [x, y] = [n[0]!, n[1]!];
      v.push([r2(x), r2(y)]);
      ins.push([0, 0]);
      outs.push([0, 0]);
    } else if (cmd.type === 'C' || cmd.type === 'Q') {
      // Quadratic control points become the cubic ones at 2/3 of the way.
      const [c1x, c1y, c2x, c2y, ex, ey] =
        cmd.type === 'C'
          ? (n as [number, number, number, number, number, number])
          : [
              x + (2 / 3) * (n[0]! - x),
              y + (2 / 3) * (n[1]! - y),
              n[2]! + (2 / 3) * (n[0]! - n[2]!),
              n[3]! + (2 / 3) * (n[1]! - n[3]!),
              n[2]!,
              n[3]!,
            ];
      outs[outs.length - 1] = [r2(c1x - x), r2(c1y - y)];
      v.push([r2(ex), r2(ey)]);
      ins.push([r2(c2x - ex), r2(c2y - ey)]);
      outs.push([0, 0]);
      [x, y] = [ex, ey];
    } else if (cmd.type === 'Z') {
      // A closing point on the start is the same vertex; keep its incoming tangent there.
      const first = v[0];
      const last = v.at(-1);
      if (first && last && v.length > 1 && first[0] === last[0] && first[1] === last[1]) {
        ins[0] = ins.at(-1)!;
        v.pop();
        ins.pop();
        outs.pop();
      }
      closed = true;
      const start = v[0];
      flush();
      if (start) [x, y] = [start[0]!, start[1]!];
    }
  }
  flush();
  return out;
}

/** The geometry of one item as Lottie shapes, or nothing for items that draw nothing. */
function geometry(item: SceneItem): Json[] {
  switch (item.kind) {
    case 'rect':
      return [
        {
          ty: 'rc',
          p: { a: 0, k: [r2(item.x + item.width / 2), r2(item.y + item.height / 2)] },
          s: { a: 0, k: [r2(item.width), r2(item.height)] },
          r: { a: 0, k: r2(item.rx ?? 0) },
        },
      ];
    case 'circle':
      return [
        {
          ty: 'el',
          p: { a: 0, k: [r2(item.cx), r2(item.cy)] },
          s: { a: 0, k: [r2(2 * item.r), r2(2 * item.r)] },
        },
      ];
    case 'line':
      return [
        {
          ty: 'sh',
          ks: {
            a: 0,
            k: {
              c: false,
              v: [
                [r2(item.x1), r2(item.y1)],
                [r2(item.x2), r2(item.y2)],
              ],
              i: [
                [0, 0],
                [0, 0],
              ],
              o: [
                [0, 0],
                [0, 0],
              ],
            },
          },
        },
      ];
    case 'path':
      return bezierShapes(item.d);
    case 'text':
    case 'math':
      return bezierShapes(item.outline);
    default:
      return [];
  }
}

/** Fill and outline of an item; text and formulas are filled outlines. */
function paintOf(item: SceneItem): Paint {
  return 'paint' in item ? item.paint : {};
}

interface Animated {
  readonly frames: number;
  readonly keyframes: { readonly t: number; readonly props: Props }[];
}

/** A Lottie property: fixed, or keyframed linearly from the timeline. */
function property(
  value: Json,
  animated: Animated | undefined,
  pick: (props: Props) => Json | undefined,
): Json {
  if (!animated) return { a: 0, k: value };
  // Keyframes that round to the same frame keep the last one, so times always increase.
  const keys: { t: number; s: Json }[] = [];
  for (const { t, props } of animated.keyframes) {
    const s = pick(props);
    if (s === undefined) continue;
    if (keys.at(-1)?.t === t) keys[keys.length - 1] = { t, s };
    else keys.push({ t, s });
  }
  if (keys.length === 0) return { a: 0, k: value };
  const wrap = (s: Json) => (Array.isArray(s) ? s : [s]);
  return {
    a: 1,
    k: keys.map((k, i) =>
      i === keys.length - 1
        ? { t: k.t, s: wrap(k.s) }
        : { t: k.t, s: wrap(k.s), i: { x: [1], y: [1] }, o: { x: [0], y: [0] } },
    ),
  };
}

const dashOf = (dash: readonly number[] | undefined) => (dash && dash.length >= 2 ? dash : SOLID);

function group(item: SceneItem, animated: Animated | undefined): Json | undefined {
  const shapes = geometry(item);
  if (shapes.length === 0) return undefined;
  const paint = paintOf(item);
  const filled =
    item.kind === 'text' || item.kind === 'math' || (paint.fill && paint.fill !== 'none');
  const stroked =
    item.kind !== 'text' && item.kind !== 'math' && paint.stroke && paint.stroke !== 'none';
  const it: Json[] = [...shapes];
  const fillColor = rgba(paint.fill) ?? [0, 0, 0, 1];
  if (filled && rgba(paint.fill)) {
    it.push({
      ty: 'fl',
      c: property(fillColor, animated, (p) => (p.fill ? (rgba(p.fill) ?? fillColor) : undefined)),
      o: { a: 0, k: 100 },
      r: 1,
    });
  }
  if (stroked && rgba(paint.stroke)) {
    const dashed =
      paint.dash !== undefined || animated?.keyframes.some((k) => k.props.dash !== undefined);
    const base = dashOf(paint.dash);
    it.push({
      ty: 'st',
      c: property(rgba(paint.stroke)!, animated, (p) =>
        p.stroke ? (rgba(p.stroke) ?? rgba(paint.stroke)!) : undefined,
      ),
      o: property(100, animated, (p) =>
        p.strokeOpacity === undefined ? undefined : r2(p.strokeOpacity * 100),
      ),
      w: property(r2(paint.strokeWidth ?? 1), animated, (p) =>
        p.strokeWidth === undefined ? undefined : r2(p.strokeWidth),
      ),
      lc: 2,
      lj: 2,
      ...(dashed
        ? {
            d: [
              {
                n: 'd',
                nm: 'dash',
                v: property(r2(base[0]!), animated, (p) =>
                  p.dash ? r2(dashOf(p.dash)[0]!) : undefined,
                ),
              },
              {
                n: 'g',
                nm: 'gap',
                v: property(r2(base[1]!), animated, (p) =>
                  p.dash ? r2(dashOf(p.dash)[1]!) : undefined,
                ),
              },
              {
                n: 'o',
                nm: 'offset',
                v: property(r2(paint.dashOffset ?? 0), animated, (p) =>
                  p.dashOffset === undefined ? undefined : r2(p.dashOffset),
                ),
              },
            ],
          }
        : {}),
    });
  }
  if (it.length === shapes.length) return undefined;
  it.push({
    ty: 'tr',
    p: property([0, 0], animated, (p) =>
      p.tx === undefined && p.ty === undefined ? undefined : [r2(p.tx ?? 0), r2(p.ty ?? 0)],
    ),
    a: { a: 0, k: [0, 0] },
    s: { a: 0, k: [100, 100] },
    r: { a: 0, k: 0 },
    o: property(r2((paint.opacity ?? 1) * 100), animated, (p) =>
      p.opacity === undefined ? undefined : r2(p.opacity * 100),
    ),
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
  });
  return { ty: 'gr', nm: item.id, it, np: it.length };
}

/** The animation as Lottie JSON text. */
export function renderLottie(
  scene: Scene,
  timeline: Timeline,
  options: LottieOptions = {},
): string {
  const fps = options.fps ?? 30;
  const full = animatedScene(scene, timeline);
  const frames = Math.max(1, Math.round((timeline.duration / 1000) * fps));
  // Tracks by item; a track on a group applies to everything inside it.
  const byId = new Map(full.items.map((i) => [i.id, i]));
  const tracks = new Map(timeline.tracks.map((t) => [t.target, t]));
  const trackOf = (item: SceneItem) => {
    for (
      let cur: SceneItem | undefined = item;
      cur;
      cur = cur.parent ? byId.get(cur.parent) : undefined
    ) {
      const t = tracks.get(cur.id);
      if (t) return t;
    }
    return undefined;
  };
  const groups: Json[] = [];
  for (const item of full.items) {
    if (item.kind === 'group') continue;
    const t = trackOf(item);
    const animated = t
      ? { frames, keyframes: t.keyframes.map((k) => ({ t: r2(k.at * frames), props: k.props })) }
      : undefined;
    const g = group(item, animated);
    if (g) groups.push(g);
  }
  if (full.background !== null) {
    const bg = group(
      {
        kind: 'rect',
        id: 'background',
        x: 0,
        y: 0,
        width: full.width,
        height: full.height,
        paint: { fill: full.background },
      },
      undefined,
    );
    if (bg) groups.unshift(bg);
  }
  // Lottie draws the first shape on top, so the paint order is reversed.
  groups.reverse();
  const w = Math.ceil(full.width);
  const h = Math.ceil(full.height);
  const doc: Json = {
    v: '5.7.0',
    fr: fps,
    ip: 0,
    op: frames,
    w,
    h,
    nm: full.title,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Diagram',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [0, 0, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        ao: 0,
        shapes: groups,
        ip: 0,
        op: frames,
        st: 0,
        bm: 0,
      },
    ],
  };
  return `${JSON.stringify(doc)}\n`;
}
