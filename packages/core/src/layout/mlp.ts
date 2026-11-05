// Layout for fully connected networks (MLPs): one column of nodes per layer, edges between
// neighbouring layers, labels under each column. Pure and deterministic: only + - * / and sqrt.

import { diagnostic, type Diagnostic } from '../diagnostics.ts';
import { familyOf, type DenseLayer, type MlpModel, type Model } from '../model/schema.ts';
import { SCENE_VERSION, type Paint, type Scene, type SceneItem } from '../scene.ts';
import {
  mergeCollapse,
  resolveTheme,
  type CollapseRule,
  type Role,
  type Theme,
} from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { stripInvalidXml } from '../util/xml.ts';
import { layoutBoxes } from './boxes.ts';
import { applyWeights } from '../animate/weights.ts';
import { layoutCnn } from './cnn.ts';
import { layoutAutoencoder } from './autoencoder.ts';
import { layoutGan } from './gan.ts';
import { layoutRnn } from './rnn.ts';
import { layoutTransformer } from './transformer.ts';
import { buildLabel, labelItems, nodeLabelText, type Label, type LabelIssue } from './label.ts';

/** Layers with more neurons than this are always collapsed, even when collapse is turned off. */
export const MAX_DRAWN_NEURONS = 500;

export interface LayoutResult {
  readonly scene: Scene;
  readonly diagnostics: readonly Diagnostic[];
}

export type Slot = number | 'ellipsis';

export interface Column {
  readonly index: number;
  readonly role: Role;
  readonly units: number;
  readonly slots: readonly Slot[];
  readonly name: Label | undefined;
  readonly size: Label | undefined;
  /** Size label drawn above the column (collapsed layer while size labels are off). */
  readonly sizeAbove: boolean;
  readonly halfWidth: number;
}

export function roleOf(index: number, count: number): Role {
  if (index === 0) return 'input';
  return index === count - 1 ? 'output' : 'hidden';
}

export function autoName(index: number, count: number): string {
  if (index === 0) return 'Input';
  if (index === count - 1) return 'Output';
  return count === 3 ? 'Hidden' : `Hidden ${index}`;
}

/** Cleans a user label for single-line display; empty means "no label". */
export function cleanLabel(text: string): string {
  return stripInvalidXml(text).replace(/\s+/g, ' ').trim();
}

const range = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/** Which neurons a layer draws: all, or first and last around an ellipsis. */
export function slotsOf(layer: DenseLayer, theme: Theme): { slots: Slot[]; forced: boolean } {
  const rule = layer.collapse === false ? undefined : mergeCollapse(theme.collapse, layer.collapse);
  let collapse: CollapseRule | undefined =
    rule && layer.units > rule.above && rule.first + rule.last < layer.units ? rule : undefined;
  let forced = false;
  if (!collapse && layer.units > MAX_DRAWN_NEURONS) {
    const base = rule ?? theme.collapse;
    collapse = { above: MAX_DRAWN_NEURONS, first: base.first, last: base.last };
    forced = true;
  }
  const slots: Slot[] = collapse
    ? [...range(0, collapse.first), 'ellipsis', ...range(layer.units - collapse.last, layer.units)]
    : range(0, layer.units);
  return { slots, forced };
}

/** The text of a layer's name label ('' hides it). */
export function nameText(layer: DenseLayer, index: number, count: number): string {
  return layer.name === undefined ? autoName(index, count) : cleanLabel(layer.name);
}

/** Turns label problems into diagnostics that point at the layer field they came from. */
export function labelReporter(
  index: number,
  field: 'name' | 'nodeLabel',
  diagnostics: Diagnostic[],
): (issue: LabelIssue) => void {
  const what = field === 'name' ? 'name' : 'node labels';
  const seen = new Set<string>();
  return (issue) => {
    const message =
      issue.kind === 'missing'
        ? `Layer ${index + 1} ${what} uses characters the bundled fonts cannot draw yet: ${issue.chars.join(' ')}`
        : `Layer ${index + 1} ${what}: the formula $${issue.tex}$ could not be read. ${issue.error}`;
    if (seen.has(message)) return;
    seen.add(message);
    diagnostics.push(
      diagnostic(
        'warning',
        issue.kind === 'missing' ? 'text.missing-glyphs' : 'text.math-invalid',
        message,
        { path: ['layers', index, field] },
      ),
    );
  };
}

/** The layer's name label, or undefined when names are off or the name is empty. */
export function layerLabel(
  layer: DenseLayer,
  index: number,
  count: number,
  theme: Theme,
  engine: TextEngine,
  diagnostics: Diagnostic[],
): Label | undefined {
  const text = nameText(layer, index, count);
  if (!theme.labels.names || !text) return undefined;
  return buildLabel(text, theme.nameText, engine, labelReporter(index, 'name', diagnostics));
}

export function layoutModel(input: Model, engine: TextEngine): LayoutResult {
  const theme = resolveTheme(input.style);
  const result = layoutPlain(input, theme, engine);
  return theme.weights ? { ...result, scene: applyWeights(result.scene, theme) } : result;
}

function layoutPlain(input: Model, theme: Theme, engine: TextEngine): LayoutResult {
  const family = familyOf(input);
  if (family === 'rnn') return layoutRnn(input, theme, engine);
  if (family === 'transformer') return layoutTransformer(input, theme, engine);
  if (family === 'gan') return layoutGan(input, theme, engine);
  if (family === 'autoencoder' || (theme.autoencoder && input.layers.length >= 3)) {
    return layoutAutoencoder(input, theme, engine);
  }
  if (family === 'cnn') return layoutCnn(input, theme, engine);
  const model = input as MlpModel;
  if (theme.mode === 'boxes') return layoutBoxes(model, theme, engine);
  const diagnostics: Diagnostic[] = [];
  const count = model.layers.length;
  const r = theme.nodeRadius;
  const pitch = 2 * r + theme.nodeSpacing;

  const columns = model.layers.map((layer, index) =>
    buildColumn(layer, index, count, theme, engine, diagnostics),
  );

  // Vertical metrics. Line metrics come from the fonts; a tall formula makes its row taller.
  const nameLine = engine.shape('', theme.nameText, theme.nameText.size);
  const sizeLine = engine.shape('', theme.sizeText, theme.sizeText.size);
  const names = columns.flatMap((c) => (c.name ? [c.name] : []));
  const nameAscent = Math.max(nameLine.ascent, ...names.map((l) => l.ascent));
  const nameDescent = Math.max(nameLine.descent, ...names.map((l) => l.descent));
  const maxSlots = Math.max(...columns.map((c) => c.slots.length));
  const span = (maxSlots - 1) * pitch;
  const anyAbove = columns.some((c) => c.sizeAbove);
  const anyName = names.length > 0;
  const anySizeBelow = columns.some((c) => c.size && !c.sizeAbove);

  const aboveBaseline = theme.margin + sizeLine.ascent;
  const top = theme.margin + (anyAbove ? sizeLine.ascent + sizeLine.descent + theme.labelGap : 0);
  const centerY = top + r + span / 2;
  const nodesBottom = top + 2 * r + span;
  let cursor = nodesBottom + theme.labelGap;
  let nameBaseline = 0;
  let sizeBaseline = 0;
  if (anyName) {
    nameBaseline = cursor + nameAscent;
    cursor = nameBaseline + nameDescent + theme.lineGap;
  }
  if (anySizeBelow) {
    sizeBaseline = cursor + sizeLine.ascent;
    cursor = sizeBaseline + sizeLine.descent;
  }
  const height = (anyName || anySizeBelow ? cursor : nodesBottom) + theme.margin;

  // Horizontal positions: at least layerSpacing apart, wider when labels would touch.
  const forward: number[] = [];
  columns.forEach((column, i) => {
    const previous = columns[i - 1];
    forward.push(
      previous === undefined
        ? theme.margin + column.halfWidth
        : forward[i - 1]! +
            Math.max(
              theme.layerSpacing,
              previous.halfWidth + column.halfWidth + theme.labelPadding,
            ),
    );
  });
  const width = forward.at(-1)! + columns.at(-1)!.halfWidth + theme.margin;
  // Right to left flow mirrors the columns; everything below works in either direction.
  const xs = theme.direction === 'rtl' ? forward.map((x) => width - x) : forward;

  const slotY = (slot: number, slots: number) => centerY + (slot - (slots - 1) / 2) * pitch;
  const visible = (column: Column) =>
    column.slots.flatMap((slot, j) =>
      slot === 'ellipsis' ? [] : [{ neuron: slot, y: slotY(j, column.slots.length) }],
    );

  const items: SceneItem[] = [];

  // Edges first, so nodes paint over their ends.
  for (let i = 0; i + 1 < count; i++) {
    items.push(
      ...edgeItems(
        i,
        visible(columns[i]!),
        visible(columns[i + 1]!),
        xs[i]!,
        xs[i + 1]!,
        r,
        theme,
        diagnostics,
      ),
    );
  }

  for (const column of columns) {
    const x = xs[column.index]!;
    const group = `layer-${column.index}`;
    const role = theme.roles[column.role];
    const nodePaint: Paint = {
      fill: role.fill,
      stroke: role.stroke,
      strokeWidth: theme.nodeStrokeWidth,
    };
    items.push({ kind: 'group', id: group, classes: ['layer', `layer-${column.role}`] });
    column.slots.forEach((slot, j) => {
      const y = slotY(j, column.slots.length);
      if (slot !== 'ellipsis') {
        items.push({
          kind: 'circle',
          id: `node-${column.index}-${slot}`,
          parent: group,
          classes: ['node', `node-${column.role}`],
          cx: x,
          cy: y,
          r,
          paint: nodePaint,
        });
        return;
      }
      const id = `ellipsis-${column.index}`;
      items.push({ kind: 'group', id, parent: group, classes: ['ellipsis'] });
      [-1, 0, 1].forEach((offset, dot) => {
        items.push({
          kind: 'circle',
          id: `${id}-${dot}`,
          parent: id,
          cx: x,
          cy: y + offset * theme.ellipsis.spacing,
          r: theme.ellipsis.radius,
          paint: { fill: theme.ellipsis.color },
        });
      });
    });
    items.push(
      ...nodeLabels(model.layers[column.index]!, column, x, slotY, theme, engine, diagnostics),
    );
  }

  if (columns.some((c) => c.name || c.size)) {
    items.push({ kind: 'group', id: 'labels', classes: ['labels'] });
    for (const column of columns) {
      const x = xs[column.index]!;
      if (column.name) {
        items.push(
          ...labelItems(
            `name-${column.index}`,
            ['label', 'label-name'],
            column.name,
            x,
            nameBaseline,
            theme.nameText,
            engine,
            'labels',
          ),
        );
      }
      if (column.size) {
        const y = column.sizeAbove ? aboveBaseline : sizeBaseline;
        items.push(
          ...labelItems(
            `size-${column.index}`,
            ['label', 'label-size'],
            column.size,
            x,
            y,
            theme.sizeText,
            engine,
            'labels',
          ),
        );
      }
    }
  }

  const title = cleanLabel(model.title ?? '') || 'Neural network diagram';
  const description = cleanLabel(model.description ?? '') || describe(model);
  return {
    scene: {
      version: SCENE_VERSION,
      width,
      height,
      background: theme.background,
      title,
      description,
      items,
    },
    diagnostics,
  };
}

export interface EdgeEnd {
  readonly neuron: number;
  readonly y: number;
}

/** Edges between two node columns at x1 and x2 (one line per pair, or one band when too many). */
export function edgeItems(
  i: number,
  from: readonly EdgeEnd[],
  to: readonly EdgeEnd[],
  x1: number,
  x2: number,
  r: number,
  theme: Theme,
  diagnostics: Diagnostic[],
): SceneItem[] {
  if (from.length === 0 || to.length === 0) return [];
  const items: SceneItem[] = [];
  const edgePaint: Paint = { stroke: theme.edge.color, strokeWidth: theme.edge.width };
  const s = x2 > x1 ? r : -r;
  const group = `edges-${i}`;
  items.push({ kind: 'group', id: group, classes: ['edges'] });
  if (from.length * to.length > theme.edgeLimit) {
    const [a0, a1] = [from[0]!.y, from.at(-1)!.y];
    const [b0, b1] = [to[0]!.y, to.at(-1)!.y];
    items.push({
      kind: 'path',
      id: `bundle-${i}`,
      parent: group,
      classes: ['edge-bundle'],
      d: `M${x1 + s} ${a0}L${x2 - s} ${b0}L${x2 - s} ${b1}L${x1 + s} ${a1}Z`,
      paint: { fill: theme.edge.color, opacity: theme.edge.bundleOpacity },
    });
    diagnostics.push(
      diagnostic(
        'warning',
        'layout.edges-bundled',
        `Layers ${i + 1} and ${i + 2} would need ${from.length * to.length} connection lines, so they are drawn as one band. Collapse one of them to see individual lines.`,
        { path: ['layers', i] },
      ),
    );
    return items;
  }
  for (const a of from) {
    for (const b of to) {
      // Start and end on the circle outlines rather than at the centers.
      const dx = x2 - x1;
      const dy = b.y - a.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const ux = (dx / length) * r;
      const uy = (dy / length) * r;
      items.push({
        kind: 'line',
        id: `edge-${i}-${a.neuron}-${i + 1}-${b.neuron}`,
        parent: group,
        classes: ['edge'],
        x1: x1 + ux,
        y1: a.y + uy,
        x2: x2 - ux,
        y2: b.y - uy,
        paint: edgePaint,
      });
    }
  }
  return items;
}

/** Labels inside the drawn nodes of one layer (`nodeLabel`), centered on each node. */
export function nodeLabels(
  layer: DenseLayer,
  column: Pick<Column, 'index' | 'role' | 'slots'>,
  x: number,
  slotY: (slot: number, slots: number) => number,
  theme: Theme,
  engine: TextEngine,
  diagnostics: Diagnostic[],
): SceneItem[] {
  const template = layer.nodeLabel === undefined ? '' : cleanLabel(layer.nodeLabel);
  if (!template) return [];
  const style = { ...theme.nodeText, color: theme.roles[column.role].text };
  const report = labelReporter(column.index, 'nodeLabel', diagnostics);
  const items: SceneItem[] = [];
  let tooWide = false;
  column.slots.forEach((slot, j) => {
    if (slot === 'ellipsis') return;
    const label = buildLabel(nodeLabelText(template, slot + 1), style, engine, report);
    if (label.width > 2 * theme.nodeRadius) tooWide = true;
    const cy = slotY(j, column.slots.length);
    // Center the label's ink box (ascent above, descent below) on the node.
    const baseline = cy + (label.ascent - label.descent) / 2;
    const id = `nodelabel-${column.index}-${slot}`;
    items.push(
      ...labelItems(id, ['node-label'], label, x, baseline, style, engine, `layer-${column.index}`),
    );
  });
  if (tooWide) {
    diagnostics.push(
      diagnostic(
        'warning',
        'layout.node-label-wide',
        `Layer ${column.index + 1} node labels are wider than the nodes. Use shorter labels or a larger nodeRadius.`,
        { path: ['layers', column.index, 'nodeLabel'] },
      ),
    );
  }
  return items;
}

function buildColumn(
  layer: DenseLayer,
  index: number,
  count: number,
  theme: Theme,
  engine: TextEngine,
  diagnostics: Diagnostic[],
): Column {
  const { slots, forced } = slotsOf(layer, theme);
  if (forced) {
    diagnostics.push(
      diagnostic(
        'warning',
        'layout.forced-collapse',
        `Layer ${index + 1} has ${layer.units} neurons, more than the ${MAX_DRAWN_NEURONS} that can be drawn one by one, so it is collapsed.`,
        { path: ['layers', index, 'collapse'] },
      ),
    );
  }
  const collapsed = slots.includes('ellipsis');
  const name = layerLabel(layer, index, count, theme, engine, diagnostics);
  const sizeAbove = !theme.labels.sizes && collapsed;
  const size =
    theme.labels.sizes || sizeAbove
      ? buildLabel(String(layer.units), theme.sizeText, engine, () => {})
      : undefined;

  return {
    index,
    role: roleOf(index, count),
    units: layer.units,
    slots,
    name,
    size,
    sizeAbove,
    halfWidth: Math.max(theme.nodeRadius, (name?.width ?? 0) / 2, (size?.width ?? 0) / 2),
  };
}

/** Plain-language description used as the figure's accessible description (alt text). */
export function describe(model: MlpModel): string {
  const count = model.layers.length;
  const parts = model.layers.map((layer, i) => {
    const name = (layer.name !== undefined && cleanLabel(layer.name)) || autoName(i, count);
    return `${name} (${layer.units} ${layer.units === 1 ? 'neuron' : 'neurons'})`;
  });
  return `Fully connected neural network with ${count} ${count === 1 ? 'layer' : 'layers'}: ${parts.join(', ')}.`;
}
