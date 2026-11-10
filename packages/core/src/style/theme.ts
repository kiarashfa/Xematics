// Presets are data, not code: a preset is a complete Theme, and a model's style options override parts of it.

import type {
  CollapseOptions,
  DashStyle,
  FunnelLook,
  PresetId,
  RecurrentLook,
  RoleStyle,
  StyleOptions,
} from '../model/schema.ts';

export type Role = 'input' | 'hidden' | 'output';

export interface RolePaint {
  readonly fill: string;
  readonly stroke: string;
  /** Color of node labels drawn on this fill. */
  readonly text: string;
  /** Outline width chosen by the user for plain neurons (px); other shapes scale with it. */
  readonly weight?: number;
  readonly dashes?: DashStyle;
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
  /** Recurrent networks: the look, how many time steps to draw, and the cell-detail figure. */
  readonly recurrent: RecurrentLook;
  readonly steps: number;
  readonly cell: boolean;
  /** GANs: neurons inside the funnels, or only names. */
  readonly funnel: FunnelLook;
  /** Fully connected networks drawn as an autoencoder (funnels meeting at the smallest layer). */
  readonly autoencoder: boolean;
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
  /** Recurrent, GAN and Transformer parts: boxes with a name inside, frames, gates. */
  readonly parts: {
    readonly attention: RolePaint;
    readonly norm: RolePaint;
    readonly feedForward: RolePaint;
    /** Gates inside a recurrent cell (σ, tanh). */
    readonly gate: RolePaint;
    readonly generator: RolePaint;
    readonly discriminator: RolePaint;
    /** Repeated blocks and the body of a cell drawn in detail. */
    readonly frame: { readonly fill: string; readonly stroke: string };
    /** State lines, residual paths and lines inside blocks. */
    readonly line: { readonly color: string; readonly width: number };
    /** Names inside boxes (fill-dependent color comes from the paint's text). */
    readonly text: Omit<TextStyle, 'color'>;
    /** The real and fake marks after a GAN's score. */
    readonly real: string;
    readonly fake: string;
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
  recurrent: 'unrolled',
  steps: 4,
  cell: false,
  funnel: 'neurons',
  autoencoder: false,
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
  parts: {
    attention: { fill: '#dcecf7', stroke: '#2f7fb5', text: INK },
    norm: { fill: '#f8f3c8', stroke: '#9a8f16', text: INK },
    feedForward: { fill: '#f1f2f4', stroke: '#4b5563', text: INK },
    gate: { fill: '#dcecf7', stroke: '#2f7fb5', text: INK },
    generator: { fill: '#e0f3ec', stroke: '#00845f', text: INK },
    discriminator: { fill: '#f7eaf2', stroke: '#a8558a', text: INK },
    frame: { fill: '#f8f9fa', stroke: MUTED },
    line: { color: INK, width: 1.4 },
    text: { family: 'Inter', weight: 500, size: 12 },
    real: '#0072b2',
    fake: '#d55e00',
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
    parts: {
      ...CLASSIC.parts,
      attention: { fill: '#ececec', stroke: '#000000', text: '#000000' },
      norm: { fill: '#d9d9d9', stroke: '#000000', text: '#000000' },
      feedForward: { fill: '#ffffff', stroke: '#000000', text: '#000000' },
      gate: { fill: '#ececec', stroke: '#000000', text: '#000000' },
      generator: { fill: '#f2f2f2', stroke: '#000000', text: '#000000' },
      discriminator: { fill: '#e3e3e3', stroke: '#000000', text: '#000000' },
      frame: { fill: '#fafafa', stroke: '#4d4d4d' },
      line: { color: '#000000', width: 1.3 },
      real: '#000000',
      fake: '#4d4d4d',
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
    parts: {
      ...CLASSIC.parts,
      attention: { fill: '#cfe8f7', stroke: '#0072b2', text: INK },
      norm: { fill: '#f6efa6', stroke: '#8a7f00', text: INK },
      feedForward: { fill: '#e5e7eb', stroke: '#6b7280', text: INK },
      gate: { fill: '#cfe8f7', stroke: '#0072b2', text: INK },
      generator: { fill: '#cdeee3', stroke: '#009e73', text: INK },
      discriminator: { fill: '#f3dceb', stroke: '#a8558a', text: INK },
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
    parts: {
      ...CLASSIC.parts,
      attention: { fill: '#24506b', stroke: '#7cc4ee', text: '#e8eaed' },
      norm: { fill: '#4f4b22', stroke: '#e6dc6a', text: '#e8eaed' },
      feedForward: { fill: '#2b313b', stroke: '#9aa3ae', text: '#e8eaed' },
      gate: { fill: '#24506b', stroke: '#7cc4ee', text: '#e8eaed' },
      generator: { fill: '#153f35', stroke: '#3fd0a8', text: '#e8eaed' },
      discriminator: { fill: '#432a3a', stroke: '#e3a7cb', text: '#e8eaed' },
      frame: { fill: '#1c2128', stroke: '#6b7480' },
      line: { color: '#e8eaed', width: 1.4 },
      real: '#56b4e9',
      fake: '#e8743b',
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

/** Outline width of plain neurons in every preset; a user weight scales other shapes by weight / this. */
export const DEFAULT_WEIGHT = 1.5;

/** Lowercase six-digit hex (#abc becomes #aabbcc). */
export function expandHex(hex: string): string {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

// Brightness with a gamma of 2 (squares only, so Node and browsers agree to the bit).
function brightness(hex: string): number {
  const n = parseInt(expandHex(hex).slice(1), 16);
  const c = (v: number) => (v / 255) * (v / 255);
  return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
}

function contrast(a: string, b: string): number {
  const x = brightness(a);
  const y = brightness(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Node label color on a user fill: the preset's text color or its opposite, whichever reads better. */
export function textOn(fill: string, presetText: string): string {
  const other = brightness(presetText) < 0.5 ? '#ffffff' : '#1f2937';
  return contrast(fill, other) > contrast(fill, presetText) ? other : presetText;
}

/**
 * The outline of a role's shape drawn at `width` px by default: the user's weight scales it
 * (0 hides it) and the dash pattern follows the drawn width.
 */
export function roleStroke(
  theme: Theme,
  role: Role,
  width: number,
): { stroke: string; strokeWidth?: number; dash?: readonly number[] } {
  const paint = theme.roles[role];
  const w = paint.weight === undefined ? width : (width * paint.weight) / DEFAULT_WEIGHT;
  if (w <= 0) return { stroke: 'none' };
  const dash = dashPattern(paint.dashes, w);
  return dash
    ? { stroke: paint.stroke, strokeWidth: w, dash }
    : { stroke: paint.stroke, strokeWidth: w };
}

function dashPattern(style: DashStyle | undefined, width: number): number[] | undefined {
  const u = Math.max(1, width);
  if (style === 'dashed') return [3 * u, 2 * u];
  if (style === 'dotted') return [u, 1.5 * u];
  if (style === 'dash-dot') return [3 * u, 1.5 * u, u, 1.5 * u];
  return undefined;
}

function resolveRole(base: RolePaint, user: RoleStyle | undefined): RolePaint {
  if (!user) return base;
  const fill = user.fill === undefined ? base.fill : expandHex(user.fill);
  const out: { -readonly [K in keyof RolePaint]: RolePaint[K] } = {
    fill,
    stroke: user.outline === undefined ? base.stroke : expandHex(user.outline),
    text: user.fill === undefined ? base.text : textOn(fill, base.text),
  };
  if (user.weight !== undefined) out.weight = user.weight;
  if (user.dashes !== undefined && user.dashes !== 'solid') out.dashes = user.dashes;
  return out;
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
    roles: {
      input: resolveRole(base.roles.input, style.input),
      hidden: resolveRole(base.roles.hidden, style.hidden),
      output: resolveRole(base.roles.output, style.output),
    },
    layerSpacing: style.layerSpacing ?? base.layerSpacing,
    direction: style.direction ?? base.direction,
    background,
    labels: {
      names: style.labels?.names ?? base.labels.names,
      sizes: style.labels?.sizes ?? base.labels.sizes,
      ops: style.labels?.ops ?? base.labels.ops,
    },
    weights: style.weights ?? base.weights,
    recurrent: style.recurrent ?? base.recurrent,
    steps: style.steps ?? base.steps,
    cell: style.cell ?? base.cell,
    funnel: style.funnel ?? base.funnel,
    autoencoder: style.autoencoder ?? base.autoencoder,
    maps: {
      ...base.maps,
      nodeRadius: style.nodeRadius ?? base.maps.nodeRadius,
      nodeSpacing: style.nodeSpacing ?? base.maps.nodeSpacing,
    },
    collapse: mergeCollapse(base.collapse, style.collapse),
  };
}
