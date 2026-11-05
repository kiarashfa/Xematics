// Presets are data, not code: a preset is a complete Theme, and a model's style options override parts of it.

import type { CollapseOptions, PresetId, StyleOptions } from '../model/schema.ts';

export type Role = 'input' | 'hidden' | 'output';

export interface RolePaint {
  readonly fill: string;
  readonly stroke: string;
  /** Color of node labels drawn on this fill. */
  readonly text: string;
}

export interface TextStyle {
  readonly family: string;
  readonly weight: number;
  readonly size: number;
  readonly color: string;
}

export interface CollapseRule {
  readonly above: number;
  readonly first: number;
  readonly last: number;
}

/** Fully resolved style. Layout reads only this. Lengths are in px (SVG user units). */
export interface Theme {
  readonly nodeRadius: number;
  /** Vertical gap between neighbouring nodes. */
  readonly nodeSpacing: number;
  readonly nodeStrokeWidth: number;
  /** Minimum horizontal distance between layer centers. */
  readonly layerSpacing: number;
  readonly margin: number;
  readonly roles: Readonly<Record<Role, RolePaint>>;
  readonly edge: { readonly color: string; readonly width: number; readonly bundleOpacity: number };
  readonly ellipsis: { readonly color: string; readonly radius: number; readonly spacing: number };
  readonly nameText: TextStyle;
  readonly sizeText: TextStyle;
  /** Labels inside nodes; the color comes from the role. */
  readonly nodeText: Omit<TextStyle, 'color'>;
  /** Gap between the lowest node and the top of the first label line. */
  readonly labelGap: number;
  readonly lineGap: number;
  /** Minimum horizontal space between the labels of neighbouring layers. */
  readonly labelPadding: number;
  /** Background color, or null for transparent. */
  readonly background: string | null;
  readonly labels: { readonly names: boolean; readonly sizes: boolean; readonly ops: boolean };
  readonly collapse: CollapseRule;
  /** Above this many connections between two layers, they are drawn as one band. */
  readonly edgeLimit: number;
  /** 'nodes' draws every neuron; 'boxes' draws one bar per layer, sized by its neuron count. */
  readonly mode: 'nodes' | 'boxes';
  /** 'rtl' mirrors the flow: input on the right. */
  readonly direction: 'ltr' | 'rtl';
  readonly box: {
    readonly width: number;
    readonly radius: number;
    /** Bar height is minHeight + perDecade * log10(neurons). */
    readonly minHeight: number;
    readonly perDecade: number;
    readonly arrow: { readonly color: string; readonly width: number };
  };
  /** Animation and weight colors: the forward signal, the backward error, and weight signs. */
  readonly motion: {
    readonly forward: string;
    readonly backward: string;
    readonly positive: string;
    readonly negative: string;
    /** Border of a hidden node the flow reaches when hidden layers stay gray. */
    readonly grayBorder: string;
  };
  /** Draw connections by a learned weight (style.weights). */
  readonly weights: boolean;
  /** Convolutional models: feature maps drawn as stacks of sheets, one per channel. */
  readonly maps: {
    /** Pooling layers get their own tint; other maps use the role paints. */
    readonly pool: { readonly fill: string; readonly stroke: string };
    /** The window on a map that a convolution or pooling step reads. */
    readonly window: string;
    /** Rays from that window to the next map. */
    readonly ray: { readonly color: string; readonly width: number };
    /** Height of the largest map's sheets in px; others scale with the square root of their size. */
    readonly face: number;
    readonly minFace: number;
    /** At most this many sheets per map. */
    readonly sheets: number;
    readonly strokeWidth: number;
    /** Node size and gap for dense layers next to feature maps (style nodeRadius/nodeSpacing override). */
    readonly nodeRadius: number;
    readonly nodeSpacing: number;
    /** Operation labels on the connectors (conv 3×3, max 2×2). */
    readonly opText: TextStyle;
  };
}

const INK = '#1f2937';
const MUTED = '#6b7280';

const CLASSIC: Theme = {
  nodeRadius: 12,
  nodeSpacing: 9,
  nodeStrokeWidth: 1.5,
  layerSpacing: 110,
  margin: 22,
  roles: {
    input: { fill: '#d4e8f5', stroke: '#0072b2', text: INK },
    hidden: { fill: '#f1f2f4', stroke: '#4b5563', text: INK },
    output: { fill: '#fbe8c4', stroke: '#b97800', text: INK },
  },
  edge: { color: '#b8c0cc', width: 0.8, bundleOpacity: 0.35 },
  ellipsis: { color: '#4b5563', radius: 2, spacing: 7 },
  nameText: { family: 'Inter', weight: 500, size: 13, color: INK },
  sizeText: { family: 'Inter', weight: 400, size: 12, color: MUTED },
  nodeText: { family: 'Inter', weight: 400, size: 10 },
  labelGap: 13,
  lineGap: 2,
  labelPadding: 12,
  background: '#ffffff',
  labels: { names: true, sizes: true, ops: true },
  collapse: { above: 10, first: 3, last: 3 },
  edgeLimit: 2500,
  mode: 'nodes',
  direction: 'ltr',
  box: { width: 30, radius: 6, minHeight: 28, perDecade: 34, arrow: { color: MUTED, width: 1.4 } },
  motion: {
    forward: '#0072b2',
    backward: '#d55e00',
    positive: '#0072b2',
    negative: '#d55e00',
    grayBorder: INK,
  },
  weights: false,
  maps: {
    pool: { fill: '#dfe3e8', stroke: '#4b5563' },
    window: '#aeb3b9',
    ray: { color: MUTED, width: 0.8 },
    face: 104,
    minFace: 16,
    sheets: 7,
    strokeWidth: 1.2,
    nodeRadius: 8,
    nodeSpacing: 5,
    opText: { family: 'Inter', weight: 400, size: 11, color: MUTED },
  },
};

/** Okabe-Ito fills, shared by the light and dark colorblind-safe presets. */
const OKABE_INPUT = '#56b4e9';
const OKABE_OUTPUT = '#e69f00';

export const PRESETS: Readonly<Record<PresetId, Theme>> = {
  // "Role tint": light role fills with outlines; input blue and output orange (Okabe-Ito based).
  classic: CLASSIC,
  // One bar per layer whose height grows with the log of its size; arrows show the flow.
  boxes: { ...CLASSIC, mode: 'boxes', layerSpacing: 96 },
  // Print-safe: gray levels encode the role (light input, white hidden, dark output).
  mono: {
    ...CLASSIC,
    roles: {
      input: { fill: '#d9d9d9', stroke: '#000000', text: '#000000' },
      hidden: { fill: '#ffffff', stroke: '#000000', text: '#000000' },
      output: { fill: '#595959', stroke: '#000000', text: '#ffffff' },
    },
    nodeStrokeWidth: 1.3,
    edge: { ...CLASSIC.edge, color: '#a6a6a6', width: 0.6 },
    ellipsis: { ...CLASSIC.ellipsis, color: '#000000' },
    nameText: { ...CLASSIC.nameText, color: '#000000' },
    sizeText: { ...CLASSIC.sizeText, color: '#4d4d4d' },
    box: { ...CLASSIC.box, arrow: { color: '#000000', width: 1.2 } },
    motion: {
      forward: '#000000',
      backward: '#7f7f7f',
      positive: '#1f2937',
      negative: '#9ca3af',
      grayBorder: '#000000',
    },
    maps: {
      ...CLASSIC.maps,
      pool: { fill: '#ececec', stroke: '#000000' },
      window: '#bfbfbf',
      ray: { color: '#4d4d4d', width: 0.7 },
      opText: { ...CLASSIC.maps.opText, color: '#4d4d4d' },
    },
  },
  colorblind: {
    ...CLASSIC,
    roles: {
      input: { fill: OKABE_INPUT, stroke: '#0072b2', text: INK },
      hidden: { fill: '#e5e7eb', stroke: '#6b7280', text: INK },
      output: { fill: OKABE_OUTPUT, stroke: '#d55e00', text: INK },
    },
    edge: { ...CLASSIC.edge, color: '#c3c8cf' },
    maps: {
      ...CLASSIC.maps,
      pool: { fill: '#d1d5db', stroke: '#6b7280' },
      window: '#b3b8bf',
    },
  },
  'colorblind-dark': {
    ...CLASSIC,
    background: '#15191f',
    roles: {
      input: { fill: OKABE_INPUT, stroke: '#9fd4f3', text: '#15191f' },
      hidden: { fill: '#2b313b', stroke: '#9aa3ae', text: '#e8eaed' },
      output: { fill: OKABE_OUTPUT, stroke: '#f3c45c', text: '#15191f' },
    },
    edge: { ...CLASSIC.edge, color: '#4a515c' },
    ellipsis: { ...CLASSIC.ellipsis, color: '#9aa3ae' },
    nameText: { ...CLASSIC.nameText, color: '#e8eaed' },
    sizeText: { ...CLASSIC.sizeText, color: '#9aa3ae' },
    box: { ...CLASSIC.box, arrow: { color: '#9aa3ae', width: 1.4 } },
    motion: {
      forward: '#56b4e9',
      backward: '#e8743b',
      positive: '#56b4e9',
      negative: '#e8743b',
      grayBorder: '#e8eaed',
    },
    maps: {
      ...CLASSIC.maps,
      pool: { fill: '#3a414d', stroke: '#9aa3ae' },
      window: '#51575f',
      ray: { color: '#9aa3ae', width: 0.8 },
      opText: { ...CLASSIC.maps.opText, color: '#9aa3ae' },
    },
  },
};

/** Display names for presets, in menu order. */
export const PRESET_NAMES: Readonly<Record<PresetId, string>> = {
  classic: 'Classic',
  boxes: 'Layer boxes',
  mono: 'Print mono',
  colorblind: 'Colorblind',
  'colorblind-dark': 'Colorblind dark',
};

export function mergeCollapse(
  base: CollapseRule,
  override: CollapseOptions | undefined,
): CollapseRule {
  if (!override) return base;
  return {
    above: override.above ?? base.above,
    first: override.first ?? base.first,
    last: override.last ?? base.last,
  };
}

export function resolveTheme(style: StyleOptions | undefined): Theme {
  const base = PRESETS[style?.preset ?? 'classic'];
  if (!style) return base;
  let background = base.background;
  if (style.background === 'transparent') background = null;
  else if (style.background !== undefined) background = style.background;
  return {
    ...base,
    nodeRadius: style.nodeRadius ?? base.nodeRadius,
    nodeSpacing: style.nodeSpacing ?? base.nodeSpacing,
    layerSpacing: style.layerSpacing ?? base.layerSpacing,
    direction: style.direction ?? base.direction,
    background,
    labels: {
      names: style.labels?.names ?? base.labels.names,
      sizes: style.labels?.sizes ?? base.labels.sizes,
      ops: style.labels?.ops ?? base.labels.ops,
    },
    weights: style.weights ?? base.weights,
    maps: {
      ...base.maps,
      nodeRadius: style.nodeRadius ?? base.maps.nodeRadius,
      nodeSpacing: style.nodeSpacing ?? base.maps.nodeSpacing,
    },
    collapse: mergeCollapse(base.collapse, style.collapse),
  };
}
