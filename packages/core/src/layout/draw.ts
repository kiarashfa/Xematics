// Drawing helpers shared by the recurrent, GAN and Transformer layouts. Shapes are collected in
// forward (left to right) coordinates and mirrored at the end for right-to-left flow. Labels are
// measured right away (layout needs their widths) but turned into scene items only at the end,
// because text outlines cannot be mirrored: a label keeps its reading direction and moves instead.
// Pure and deterministic: only + - * / and sqrt.

import type { Diagnostic } from '../diagnostics.ts';
import { SCENE_VERSION, type Paint, type Scene, type SceneItem, type TextItem } from '../scene.ts';
import type { TextStyle, Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { num } from '../util/format.ts';
import { buildLabel, labelItems, type Label, type LabelIssue } from './label.ts';

export type Point = readonly [number, number];

interface ItemOptions {
  readonly parent?: string;
  readonly classes?: readonly string[];
}

interface PendingLabel {
  readonly kind: 'label';
  readonly id: string;
  readonly classes: readonly string[];
  readonly label: Label;
  /** Forward x of the label's center, and its baseline. */
  readonly center: number;
  readonly baseline: number;
  readonly style: TextStyle;
  readonly parent: string;
  /** Turned a quarter to the left around this point (names in slim boxes). */
  readonly turn?: Point;
}

type Entry = SceneItem | PendingLabel;

/** Arrow head size, as in the convolutional layout. */
export const HEAD_LENGTH = 8;
export const HEAD_HALF = 4.5;

/** Subscript digits for step labels: x₁, h₀, y₂₀. */
export function subscript(n: number): string {
  return [...String(n)].map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('');
}

/** Applies `map` to every coordinate pair of absolute path data (M, L, Q, C, Z). */
export function mapPath(d: string, map: (x: number, y: number) => Point): string {
  let out = '';
  const re = /([MLQCZ])|(-?\d*\.?\d+(?:e-?\d+)?)/g;
  let pending: number | undefined;
  let first = true;
  for (const match of d.matchAll(re)) {
    if (match[1]) {
      out += match[1];
      first = true;
      pending = undefined;
      continue;
    }
    const value = Number(match[2]);
    if (pending === undefined) {
      pending = value;
      continue;
    }
    const [x, y] = map(pending, value);
    out += `${first ? '' : ' '}${num(x)} ${num(y)}`;
    first = false;
    pending = undefined;
  }
  return out;
}

export class Painter {
  private readonly entries: Entry[] = [];
  private readonly groups = new Set<string>();
  readonly theme: Theme;
  readonly engine: TextEngine;
  readonly diagnostics: Diagnostic[];

  constructor(theme: Theme, engine: TextEngine, diagnostics: Diagnostic[]) {
    this.theme = theme;
    this.engine = engine;
    this.diagnostics = diagnostics;
  }

  /** Measures a label (names may contain math and any script). */
  measure(text: string, style: TextStyle, report: (issue: LabelIssue) => void = () => {}): Label {
    return buildLabel(text, style, this.engine, report);
  }

  /** Adds a group once; asking again for the same id does nothing. */
  group(id: string, classes: readonly string[] = [], parent?: string): void {
    if (this.groups.has(id)) return;
    this.groups.add(id);
    this.entries.push({
      kind: 'group',
      id,
      ...(parent ? { parent } : {}),
      ...(classes.length > 0 ? { classes } : {}),
    });
  }

  rect(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    paint: Paint,
    o: ItemOptions & { readonly rx?: number } = {},
  ): void {
    this.entries.push({
      kind: 'rect',
      id,
      ...extra(o),
      x,
      y,
      width,
      height,
      ...(o.rx ? { rx: o.rx } : {}),
      paint,
    });
  }

  circle(id: string, cx: number, cy: number, r: number, paint: Paint, o: ItemOptions = {}): void {
    this.entries.push({ kind: 'circle', id, ...extra(o), cx, cy, r, paint });
  }

  line(
    id: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    paint: Paint,
    o: ItemOptions = {},
  ): void {
    this.entries.push({ kind: 'line', id, ...extra(o), x1, y1, x2, y2, paint });
  }

  path(id: string, d: string, paint: Paint, o: ItemOptions = {}): void {
    this.entries.push({ kind: 'path', id, ...extra(o), d, paint });
  }

  /** A polygon through the points. */
  polygon(id: string, points: readonly Point[], paint: Paint, o: ItemOptions = {}): void {
    this.path(id, `M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`, paint, o);
  }

  /**
   * An arrow along the points, its head on the last one. Two points make a line (the animation
   * treats it as a connection); more make a path. The head is `${id}-head`.
   */
  arrow(
    id: string,
    points: readonly Point[],
    color: string,
    width: number,
    o: ItemOptions = {},
  ): void {
    const [ax, ay] = points.at(-2)!;
    const [bx, by] = points.at(-1)!;
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    // The line stops inside the head so its square end never shows past the tip.
    const end: Point = [bx - ux * (HEAD_LENGTH - 1), by - uy * (HEAD_LENGTH - 1)];
    const paint: Paint = { stroke: color, strokeWidth: width };
    if (points.length === 2) {
      this.line(id, ax, ay, end[0], end[1], paint, o);
    } else {
      const d = [...points.slice(0, -1), end]
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`)
        .join('');
      this.path(id, d, { ...paint, fill: 'none' }, o);
    }
    this.head(`${id}-head`, bx, by, ux, uy, color, o);
  }

  /** An arrow head with its tip at (x, y), pointing along (ux, uy) (a unit vector). */
  head(
    id: string,
    x: number,
    y: number,
    ux: number,
    uy: number,
    color: string,
    o: ItemOptions = {},
  ) {
    const back: Point = [x - ux * HEAD_LENGTH, y - uy * HEAD_LENGTH];
    const px = -uy * HEAD_HALF;
    const py = ux * HEAD_HALF;
    this.polygon(
      id,
      [
        [x, y],
        [back[0] + px, back[1] + py],
        [back[0] - px, back[1] - py],
      ],
      { fill: color },
      { ...o, classes: [...(o.classes ?? []), 'arrow-head'] },
    );
  }

  /** A label with its baseline at y; `anchor` says which end of the label sits at x. */
  label(
    id: string,
    label: Label,
    x: number,
    baseline: number,
    style: TextStyle,
    o: { anchor?: 'start' | 'middle' | 'end'; parent?: string; classes?: readonly string[] } = {},
  ): void {
    const anchor = o.anchor ?? 'middle';
    const center =
      anchor === 'middle' ? x : anchor === 'start' ? x + label.width / 2 : x - label.width / 2;
    this.entries.push({
      kind: 'label',
      id,
      classes: o.classes ?? ['label'],
      label,
      center,
      baseline,
      style,
      parent: o.parent ?? 'labels',
    });
  }

  /** A label centered on (x, cy). */
  centered(
    id: string,
    label: Label,
    x: number,
    cy: number,
    style: TextStyle,
    o: { parent?: string; classes?: readonly string[] } = {},
  ): void {
    this.label(id, label, x, cy + (label.ascent - label.descent) / 2, style, o);
  }

  /**
   * `base` with `sub` lowered and smaller after it (x₁, h₀), centered on (x, cy); `anchor` 'end'
   * puts the whole pair's right end at x. Drawn as two runs because the bundled fonts have no
   * subscript digits. Returns the pair's width.
   */
  subscripted(
    id: string,
    base: string,
    sub: string,
    x: number,
    cy: number,
    style: TextStyle,
    o: { anchor?: 'middle' | 'end' | 'start'; classes?: readonly string[] } = {},
  ): number {
    const small: TextStyle = { ...style, size: Math.round(style.size * 0.72 * 100) / 100 };
    const a = this.measure(base, style);
    const b = this.measure(sub, small);
    const width = a.width + b.width;
    const anchor = o.anchor ?? 'middle';
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const baseline = cy + (a.ascent - a.descent) / 2;
    const classes = o.classes ?? ['label'];
    // Each run is mirrored on its own with right-to-left flow, so lay them out swapped there.
    const rtl = this.theme.direction === 'rtl';
    this.label(id, a, rtl ? left + b.width : left, baseline, style, { anchor: 'start', classes });
    this.label(`${id}-sub`, b, rtl ? left : left + a.width, baseline + style.size * 0.28, small, {
      anchor: 'start',
      classes,
    });
    return width;
  }

  /** Width of `base` followed by a subscript, as `subscripted` draws it. */
  subscriptWidth(base: string, sub: string, style: TextStyle): number {
    const small: TextStyle = { ...style, size: Math.round(style.size * 0.72 * 100) / 100 };
    return this.measure(base, style).width + this.measure(sub, small).width;
  }

  /** A label centered on (cx, cy), reading bottom to top. Plain text only (no formulas). */
  turned(
    id: string,
    label: Label,
    cx: number,
    cy: number,
    style: TextStyle,
    o: { parent?: string; classes?: readonly string[] } = {},
  ): void {
    if (label.parts.length !== 1 || label.parts[0]!.kind !== 'text') {
      this.centered(id, label, cx, cy, style, o);
      return;
    }
    this.entries.push({
      kind: 'label',
      id,
      classes: o.classes ?? ['label'],
      label,
      center: cx,
      baseline: cy + (label.ascent - label.descent) / 2,
      style,
      parent: o.parent ?? 'labels',
      turn: [cx, cy],
    });
  }

  /** The finished scene; with right-to-left flow every x is mirrored. */
  finish(
    width: number,
    height: number,
    meta: { title: string; description: string; family: NonNullable<Scene['family']> },
  ): Scene {
    const rtl = this.theme.direction === 'rtl';
    const X = (x: number) => (rtl ? width - x : x);
    const items: SceneItem[] = [];
    for (const entry of this.entries) {
      if (entry.kind === 'label') {
        items.push(...this.labelOut(entry, X(entry.center)));
        continue;
      }
      if (!rtl) {
        items.push(entry);
        continue;
      }
      switch (entry.kind) {
        case 'rect':
          items.push({ ...entry, x: width - entry.x - entry.width });
          break;
        case 'circle':
          items.push({ ...entry, cx: X(entry.cx) });
          break;
        case 'line':
          items.push({ ...entry, x1: X(entry.x1), x2: X(entry.x2) });
          break;
        case 'path':
          items.push({ ...entry, d: mapPath(entry.d, (x, y) => [X(x), y]) });
          break;
        default:
          items.push(entry);
      }
    }
    return {
      version: SCENE_VERSION,
      width,
      height,
      background: this.theme.background,
      title: meta.title,
      description: meta.description,
      items,
      family: meta.family,
    };
  }

  private labelOut(entry: PendingLabel, center: number): SceneItem[] {
    const { label, style } = entry;
    if (!entry.turn) {
      return labelItems(
        entry.id,
        entry.classes,
        label,
        center,
        entry.baseline,
        style,
        this.engine,
        entry.parent,
      );
    }
    const part = label.parts[0]!;
    if (part.kind !== 'text') return [];
    const shaped = part.shaped;
    const cy = entry.turn[1];
    const flat = this.engine.outline(shaped, center - shaped.width / 2, entry.baseline);
    // rotate(-90) around (center, cy): x' = cx + (y - cy), y' = cy - (x - cx).
    const outline = mapPath(flat, (x, y) => [center + (y - cy), cy - (x - center)]);
    const item: TextItem = {
      kind: 'text',
      id: entry.id,
      parent: entry.parent,
      ...(entry.classes.length > 0 ? { classes: entry.classes } : {}),
      text: shaped.text,
      x: center,
      y: entry.baseline,
      anchor: 'middle',
      direction: shaped.direction,
      font: { family: style.family, weight: style.weight, size: style.size },
      width: shaped.width,
      outline,
      paint: { fill: style.color },
      rotate: { angle: -90, cx: center, cy },
    };
    return [item];
  }
}

function extra(o: ItemOptions): { parent?: string; classes?: readonly string[] } {
  return {
    ...(o.parent ? { parent: o.parent } : {}),
    ...(o.classes && o.classes.length > 0 ? { classes: o.classes } : {}),
  };
}
