// Presets are data, not code: a preset is a complete Theme, and a model's style options override parts of it.

import type { CollapseOptions, PresetId, StyleOptions } from '../model/schema.ts';

export type Role = 'input' | 'hidden' | 'output';

export interface RolePaint {
  readonly fill: string;
  readonly stroke: string;
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
  /** Gap between the lowest node and the top of the first label line. */
  readonly labelGap: number;
  readonly lineGap: number;
  /** Minimum horizontal space between the labels of neighbouring layers. */
  readonly labelPadding: number;
  /** Background color, or null for transparent. */
  readonly background: string | null;
  readonly labels: { readonly names: boolean; readonly sizes: boolean };
  readonly collapse: CollapseRule;
  /** Above this many connections between two layers, they are drawn as one band. */
  readonly edgeLimit: number;
}

const INK = '#1f2937';
const MUTED = '#6b7280';

export const PRESETS: Readonly<Record<PresetId, Theme>> = {
  // "Role tint": light role fills with outlines; input blue and output orange (Okabe-Ito based).
  classic: {
    nodeRadius: 12,
    nodeSpacing: 9,
    nodeStrokeWidth: 1.5,
    layerSpacing: 110,
    margin: 22,
    roles: {
      input: { fill: '#d4e8f5', stroke: '#0072b2' },
      hidden: { fill: '#f1f2f4', stroke: '#4b5563' },
      output: { fill: '#fbe8c4', stroke: '#b97800' },
    },
    edge: { color: '#b8c0cc', width: 0.8, bundleOpacity: 0.35 },
    ellipsis: { color: '#4b5563', radius: 2, spacing: 7 },
    nameText: { family: 'Inter', weight: 500, size: 13, color: INK },
    sizeText: { family: 'Inter', weight: 400, size: 12, color: MUTED },
    labelGap: 13,
    lineGap: 2,
    labelPadding: 12,
    background: '#ffffff',
    labels: { names: true, sizes: true },
    collapse: { above: 10, first: 3, last: 3 },
    edgeLimit: 2500,
  },
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
    background,
    labels: {
      names: style.labels?.names ?? base.labels.names,
      sizes: style.labels?.sizes ?? base.labels.sizes,
    },
    collapse: mergeCollapse(base.collapse, style.collapse),
  };
}
