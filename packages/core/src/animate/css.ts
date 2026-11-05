// Animated SVG: the timeline compiled to CSS @keyframes inside the file, so it plays anywhere an
// image can (README, slides, <img>) without scripts. Viewers that ask for reduced motion see the
// still figure.

import { renderSvg, type SvgOptions } from '../render/svg.ts';
import type { Scene } from '../scene.ts';
import { num } from '../util/format.ts';
import type { Props, Timeline } from './timeline.ts';

/** The scene with the animation's extra items (signal dots) added on top. */
export function animatedScene(scene: Scene, timeline: Timeline): Scene {
  return timeline.extras.length === 0
    ? scene
    : { ...scene, items: [...scene.items, ...timeline.extras] };
}

function declarations(props: Props): string {
  const out: string[] = [];
  if (props.fill !== undefined) out.push(`fill:${props.fill}`);
  if (props.stroke !== undefined) out.push(`stroke:${props.stroke}`);
  if (props.strokeWidth !== undefined) out.push(`stroke-width:${num(props.strokeWidth)}px`);
  if (props.strokeOpacity !== undefined) out.push(`stroke-opacity:${num(props.strokeOpacity)}`);
  if (props.opacity !== undefined) out.push(`opacity:${num(props.opacity)}`);
  if (props.dash !== undefined)
    out.push(
      `stroke-dasharray:${props.dash.length > 0 ? props.dash.map((d) => `${num(d)}px`).join(' ') : 'none'}`,
    );
  if (props.dashOffset !== undefined) out.push(`stroke-dashoffset:${num(props.dashOffset)}px`);
  if (props.tx !== undefined || props.ty !== undefined)
    out.push(`transform:translate(${num(props.tx ?? 0)}px,${num(props.ty ?? 0)}px)`);
  return out.join(';');
}

/** CSS for a timeline; identical keyframe lists share one name. */
export function timelineCss(timeline: Timeline, prefix: string): string {
  const names = new Map<string, string>();
  const frames: string[] = [];
  const rules: string[] = [];
  const timing = timeline.loop ? 'infinite' : '1 forwards';
  for (const track of timeline.tracks) {
    const body = track.keyframes
      .map((k) => `${Math.round(k.at * 1e5) / 1e3}%{${declarations(k.props)}}`)
      .join('');
    let name = names.get(body);
    if (!name) {
      name = `${prefix}a${names.size}`;
      names.set(body, name);
      frames.push(`@keyframes ${name}{${body}}`);
    }
    rules.push(
      `#${prefix}${track.target}{animation:${name} ${timeline.duration}ms linear ${timing}}`,
    );
  }
  return `${frames.join('')}${rules.join('')}@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
}

/** A standalone animated SVG document. */
export function renderAnimatedSvg(
  scene: Scene,
  timeline: Timeline,
  options: SvgOptions = {},
): string {
  const prefix = options.prefix ?? 'xm-';
  const svg = renderSvg(animatedScene(scene, timeline), options);
  const marker = '</desc>\n';
  const at = svg.indexOf(marker);
  if (at < 0) throw new Error('Unexpected SVG structure.');
  const end = at + marker.length;
  return `${svg.slice(0, end)}  <style>${timelineCss(timeline, prefix)}</style>\n${svg.slice(end)}`;
}
