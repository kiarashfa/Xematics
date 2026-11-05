// Scene IR: the renderer-neutral output of layout. Every exporter (SVG now; TikZ, PDF and the
// animation timeline later) reads only this.
//
// - `items` is flat and in paint order. A group appears before the items that name it as `parent`.
// - IDs are stable: they derive from the model's structure (layer and neuron indices), never from
//   positions or counters, so animations and tests can target them across edits.
// - Paint is fully resolved (no theme lookups needed); `classes` carry semantic roles.

export const SCENE_VERSION = 1;

export interface Paint {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly opacity?: number;
  /** Dash pattern and offset in px (animation frames only). */
  readonly dash?: readonly number[];
  readonly dashOffset?: number;
}

interface ItemBase {
  readonly id: string;
  readonly parent?: string;
  readonly classes?: readonly string[];
}

export interface GroupItem extends ItemBase {
  readonly kind: 'group';
}

export interface CircleItem extends ItemBase {
  readonly kind: 'circle';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly paint: Paint;
}

export interface RectItem extends ItemBase {
  readonly kind: 'rect';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rx?: number;
  readonly paint: Paint;
}

export interface LineItem extends ItemBase {
  readonly kind: 'line';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly paint: Paint;
}

export interface PathItem extends ItemBase {
  readonly kind: 'path';
  readonly d: string;
  readonly paint: Paint;
}

export interface TextItem extends ItemBase {
  readonly kind: 'text';
  readonly text: string;
  /** Anchor point; `y` is the baseline. */
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly direction: 'ltr' | 'rtl';
  readonly font: { readonly family: string; readonly weight: number; readonly size: number };
  /** Measured advance width in px. */
  readonly width: number;
  /** The same text as SVG path data, already positioned (and rotated). */
  readonly outline: string;
  readonly paint: Paint;
  /** Turned by `angle` degrees (clockwise, as in SVG) around (cx, cy); names in slim boxes use -90. */
  readonly rotate?: { readonly angle: number; readonly cx: number; readonly cy: number };
}

/** A typeset formula (from TeX). Always drawn as outlines; `tex` keeps the source for other exporters. */
export interface MathItem extends ItemBase {
  readonly kind: 'math';
  readonly tex: string;
  /** Left end of the baseline. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Font size the formula is set at, in px. */
  readonly size: number;
  readonly outline: string;
  readonly paint: Paint;
}

export type SceneItem =
  GroupItem | CircleItem | RectItem | LineItem | PathItem | TextItem | MathItem;

export interface Scene {
  readonly version: typeof SCENE_VERSION;
  readonly width: number;
  readonly height: number;
  /** Background color, or null for transparent. */
  readonly background: string | null;
  /** Accessible name and description of the figure. */
  readonly title: string;
  readonly description: string;
  readonly items: readonly SceneItem[];
  /** Set for recurrent, GAN and Transformer diagrams: exporters draw their items generically. */
  readonly family?: 'rnn' | 'gan' | 'transformer' | 'autoencoder';
}
