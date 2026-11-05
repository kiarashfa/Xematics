// The editor's animation player: the same timeline that exports as CSS, played on the preview
// with the Web Animations API (no inline styles, so it works under the site's security policy).

import type { Props, Timeline } from '@xematics/core';

function keyframe(props: Props, offset: number): Keyframe {
  const k: Keyframe = { offset, easing: 'linear' };
  if (props.fill !== undefined) k['fill'] = props.fill;
  if (props.stroke !== undefined) k['stroke'] = props.stroke;
  if (props.strokeWidth !== undefined) k['strokeWidth'] = `${props.strokeWidth}px`;
  if (props.strokeOpacity !== undefined) k['strokeOpacity'] = String(props.strokeOpacity);
  if (props.opacity !== undefined) k['opacity'] = String(props.opacity);
  if (props.dash !== undefined)
    k['strokeDasharray'] =
      props.dash.length > 0 ? props.dash.map((d) => `${d}px`).join(' ') : 'none';
  if (props.dashOffset !== undefined) k['strokeDashoffset'] = `${props.dashOffset}px`;
  if (props.tx !== undefined || props.ty !== undefined)
    k['transform'] = `translate(${props.tx ?? 0}px, ${props.ty ?? 0}px)`;
  return k;
}

export class Player {
  #animations: Animation[] = [];
  #duration = 1;
  #loop = true;

  /** Starts the timeline on a freshly mounted preview, at `time` ms, playing or paused. */
  attach(
    root: Element,
    timeline: Timeline,
    prefix: string,
    time: number,
    playing: boolean,
    rate: number,
  ): void {
    this.detach();
    this.#duration = timeline.duration;
    this.#loop = timeline.loop;
    for (const track of timeline.tracks) {
      const element = root.querySelector(`#${CSS.escape(prefix + track.target)}`);
      if (!element) continue;
      const animation = element.animate(
        track.keyframes.map((k) => keyframe(k.props, k.at)),
        { duration: timeline.duration, iterations: timeline.loop ? Infinity : 1, fill: 'both' },
      );
      animation.pause();
      animation.currentTime = time;
      animation.playbackRate = rate;
      this.#animations.push(animation);
    }
    if (playing) this.play();
  }

  detach(): void {
    for (const animation of this.#animations) animation.cancel();
    this.#animations = [];
  }

  play(): void {
    if (!this.#loop && this.time >= this.#duration) this.seek(0);
    for (const animation of this.#animations) animation.play();
  }

  pause(): void {
    for (const animation of this.#animations) animation.pause();
  }

  seek(ms: number): void {
    for (const animation of this.#animations) animation.currentTime = ms;
  }

  set rate(value: number) {
    for (const animation of this.#animations) animation.playbackRate = value;
  }

  get duration(): number {
    return this.#duration;
  }

  /** Position within one loop, in ms. */
  get time(): number {
    const current = Number(this.#animations[0]?.currentTime ?? 0);
    return this.#loop ? current % this.#duration : Math.min(current, this.#duration);
  }

  get finished(): boolean {
    return !this.#loop && this.#animations[0]?.playState === 'finished';
  }
}

export const player = new Player();

/** True when the visitor asked the system for less motion. */
export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
