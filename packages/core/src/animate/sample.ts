// Still frames of an animation, for GIF and WebM export: the timeline evaluated at one moment and
// applied to the scene's paint. Interpolation is linear, like the CSS (`linear` timing).

import type { Paint, Scene, SceneItem } from '../scene.ts';
import { animatedScene } from './css.ts';
import { mixColor } from './random.ts';
import type { Props, Timeline } from './timeline.ts';

function lerp(a: Props, b: Props, t: number): Props {
  const n = (x: number | undefined, y: number | undefined) =>
    x === undefined || y === undefined ? (x ?? y) : x + (y - x) * t;
  const c = (x: string | undefined, y: string | undefined) =>
    x === undefined || y === undefined || x === 'none' || y === 'none'
      ? t < 0.5
        ? x
        : y
      : mixColor(x, y, t);
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) out[key] = value;
  };
  set('fill', c(a.fill, b.fill));
  set('stroke', c(a.stroke, b.stroke));
  set('strokeWidth', n(a.strokeWidth, b.strokeWidth));
  set('strokeOpacity', n(a.strokeOpacity, b.strokeOpacity));
  set('opacity', n(a.opacity, b.opacity));
  // Dash patterns switch at once, as in CSS; the offset moves smoothly.
  set('dash', a.dash && b.dash && a.dash.length === 0 ? a.dash : (b.dash ?? a.dash));
  set('dashOffset', n(a.dashOffset, b.dashOffset));
  set('tx', n(a.tx, b.tx));
  set('ty', n(a.ty, b.ty));
  return out as Props;
}

/** The timeline's values at time `ms`, by target id. */
export function sampleTimeline(timeline: Timeline, ms: number): Map<string, Props> {
  const d = timeline.duration;
  const t = timeline.loop ? (((ms % d) + d) % d) / d : Math.min(1, Math.max(0, ms / d));
  const out = new Map<string, Props>();
  for (const track of timeline.tracks) {
    const frames = track.keyframes;
    let i = 0;
    while (i < frames.length - 2 && frames[i + 1]!.at <= t) i++;
    const a = frames[i]!;
    const b = frames[i + 1] ?? a;
    const span = b.at - a.at;
    out.set(
      track.target,
      lerp(a.props, b.props, span > 0 ? Math.min(1, Math.max(0, (t - a.at) / span)) : 1),
    );
  }
  return out;
}

function applyProps(item: SceneItem, props: Props): SceneItem {
  if (item.kind === 'group') return item;
  const paint: Record<string, unknown> = { ...item.paint };
  if (props.fill !== undefined) paint['fill'] = props.fill;
  if (props.stroke !== undefined) paint['stroke'] = props.stroke;
  if (props.strokeWidth !== undefined) paint['strokeWidth'] = props.strokeWidth;
  // Lines have no fill, so their stroke opacity is their opacity.
  const opacity = props.opacity ?? props.strokeOpacity;
  if (opacity !== undefined) paint['opacity'] = opacity;
  if (props.dash !== undefined) {
    if (props.dash.length > 0) {
      paint['dash'] = props.dash;
      paint['dashOffset'] = props.dashOffset ?? 0;
    } else {
      delete paint['dash'];
      delete paint['dashOffset'];
    }
  }
  const next = { ...item, paint: paint as Paint } as SceneItem;
  if (next.kind === 'circle' && (props.tx !== undefined || props.ty !== undefined)) {
    return { ...next, cx: next.cx + (props.tx ?? 0), cy: next.cy + (props.ty ?? 0) };
  }
  return next;
}

/** The scene as it looks at time `ms` of the animation. */
export function sampleScene(scene: Scene, timeline: Timeline, ms: number): Scene {
  const values = sampleTimeline(timeline, ms);
  const full = animatedScene(scene, timeline);
  return {
    ...full,
    items: full.items.map((item) => {
      const props = values.get(item.id);
      return props ? applyProps(item, props) : item;
    }),
  };
}
