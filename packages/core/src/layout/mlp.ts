// Layout for fully connected networks (MLPs): one column of nodes per layer, edges between
// neighbouring layers, labels under each column. Pure and deterministic: only + - * / and sqrt.

import { diagnostic, type Diagnostic } from '../diagnostics.ts';
import type { Layer, Model } from '../model/schema.ts';
import { SCENE_VERSION, type Paint, type Scene, type SceneItem, type TextItem } from '../scene.ts';
import {
  mergeCollapse,
  resolveTheme,
  type CollapseRule,
  type Role,
  type TextStyle,
  type Theme,
} from '../style/theme.ts';
import type { ShapedText, TextEngine } from '../text/engine.ts';
import { stripInvalidXml } from '../util/xml.ts';
import { layoutBoxes } from './boxes.ts';

/** Layers with more neurons than this are always collapsed, even when collapse is turned off. */
export const MAX_DRAWN_NEURONS = 500;

export interface LayoutResult {
  readonly scene: Scene;
  readonly diagnostics: readonly Diagnostic[];
}

type Slot = number | 'ellipsis';

interface Column {
  readonly index: number;
  readonly role: Role;
  readonly units: number;
  readonly slots: readonly Slot[];
  readonly name: ShapedText | undefined;
  readonly size: ShapedText | undefined;
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

export function layoutModel(model: Model, engine: TextEngine): LayoutResult {
  const theme = resolveTheme(model.style);
  if (theme.mode === 'boxes') return layoutBoxes(model, theme, engine);
  const diagnostics: Diagnostic[] = [];
  const count = model.layers.length;
  const r = theme.nodeRadius;
  const pitch = 2 * r + theme.nodeSpacing;

  const columns = model.layers.map((layer, index) =>
    buildColumn(layer, index, count, theme, engine, diagnostics),
  );

  // Vertical metrics. Line metrics come from the fonts, so they do not depend on label text.
  const nameLine = engine.shape('', theme.nameText, theme.nameText.size);
  const sizeLine = engine.shape('', theme.sizeText, theme.sizeText.size);
  const maxSlots = Math.max(...columns.map((c) => c.slots.length));
  const span = (maxSlots - 1) * pitch;
  const anyAbove = columns.some((c) => c.sizeAbove);
  const anyName = columns.some((c) => c.name);
  const anySizeBelow = columns.some((c) => c.size && !c.sizeAbove);

  const aboveBaseline = theme.margin + sizeLine.ascent;
  const top = theme.margin + (anyAbove ? sizeLine.ascent + sizeLine.descent + theme.labelGap : 0);
  const centerY = top + r + span / 2;
  const nodesBottom = top + 2 * r + span;
  let cursor = nodesBottom + theme.labelGap;
  let nameBaseline = 0;
  let sizeBaseline = 0;
  if (anyName) {
    nameBaseline = cursor + nameLine.ascent;
    cursor = nameBaseline + nameLine.descent + theme.lineGap;
  }
  if (anySizeBelow) {
    sizeBaseline = cursor + sizeLine.ascent;
    cursor = sizeBaseline + sizeLine.descent;
  }
  const height = (anyName || anySizeBelow ? cursor : nodesBottom) + theme.margin;

  // Horizontal positions: at least layerSpacing apart, wider when labels would touch.
  const xs: number[] = [];
  columns.forEach((column, i) => {
    const previous = columns[i - 1];
    xs.push(
      previous === undefined
        ? theme.margin + column.halfWidth
        : xs[i - 1]! +
            Math.max(
              theme.layerSpacing,
              previous.halfWidth + column.halfWidth + theme.labelPadding,
            ),
    );
  });
  const width = xs.at(-1)! + columns.at(-1)!.halfWidth + theme.margin;

  const slotY = (slot: number, slots: number) => centerY + (slot - (slots - 1) / 2) * pitch;
  const visible = (column: Column) =>
    column.slots.flatMap((slot, j) =>
      slot === 'ellipsis' ? [] : [{ neuron: slot, y: slotY(j, column.slots.length) }],
    );

  const items: SceneItem[] = [];

  // Edges first, so nodes paint over their ends.
  const edgePaint: Paint = { stroke: theme.edge.color, strokeWidth: theme.edge.width };
  for (let i = 0; i + 1 < count; i++) {
    const from = visible(columns[i]!);
    const to = visible(columns[i + 1]!);
    if (from.length === 0 || to.length === 0) continue;
    const x1 = xs[i]!;
    const x2 = xs[i + 1]!;
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
        d: `M${x1 + r} ${a0}L${x2 - r} ${b0}L${x2 - r} ${b1}L${x1 + r} ${a1}Z`,
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
      continue;
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
  }

  if (columns.some((c) => c.name || c.size)) {
    items.push({ kind: 'group', id: 'labels', classes: ['labels'] });
    for (const column of columns) {
      const x = xs[column.index]!;
      if (column.name) {
        items.push(
          textItem(
            `name-${column.index}`,
            ['label', 'label-name'],
            column.name,
            x,
            nameBaseline,
            theme.nameText,
            engine,
          ),
        );
      }
      if (column.size) {
        const y = column.sizeAbove ? aboveBaseline : sizeBaseline;
        items.push(
          textItem(
            `size-${column.index}`,
            ['label', 'label-size'],
            column.size,
            x,
            y,
            theme.sizeText,
            engine,
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

function buildColumn(
  layer: Layer,
  index: number,
  count: number,
  theme: Theme,
  engine: TextEngine,
  diagnostics: Diagnostic[],
): Column {
  const rule = layer.collapse === false ? undefined : mergeCollapse(theme.collapse, layer.collapse);
  let collapse: CollapseRule | undefined =
    rule && layer.units > rule.above && rule.first + rule.last < layer.units ? rule : undefined;
  if (!collapse && layer.units > MAX_DRAWN_NEURONS) {
    const base = rule ?? theme.collapse;
    collapse = { above: MAX_DRAWN_NEURONS, first: base.first, last: base.last };
    diagnostics.push(
      diagnostic(
        'warning',
        'layout.forced-collapse',
        `Layer ${index + 1} has ${layer.units} neurons, more than the ${MAX_DRAWN_NEURONS} that can be drawn one by one, so it is collapsed.`,
        { path: ['layers', index, 'collapse'] },
      ),
    );
  }
  const slots: Slot[] = collapse
    ? [...range(0, collapse.first), 'ellipsis', ...range(layer.units - collapse.last, layer.units)]
    : range(0, layer.units);

  const name = layerName(layer, index, count, theme, engine, diagnostics);
  const sizeAbove = !theme.labels.sizes && collapse !== undefined;
  const size =
    theme.labels.sizes || sizeAbove
      ? engine.shape(String(layer.units), theme.sizeText, theme.sizeText.size)
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

/** The layer's name label, shaped, or undefined when names are off or the name is empty. */
export function layerName(
  layer: Layer,
  index: number,
  count: number,
  theme: Theme,
  engine: TextEngine,
  diagnostics: Diagnostic[],
): ShapedText | undefined {
  const text = layer.name === undefined ? autoName(index, count) : cleanLabel(layer.name);
  if (!theme.labels.names || !text) return undefined;
  const shaped = engine.shape(text, theme.nameText, theme.nameText.size);
  if (shaped.missing.length > 0) {
    diagnostics.push(
      diagnostic(
        'warning',
        'text.missing-glyphs',
        `Layer ${index + 1} name uses characters the bundled font cannot draw yet: ${shaped.missing.join(' ')}`,
        { path: ['layers', index, 'name'] },
      ),
    );
  }
  return shaped;
}

export function textItem(
  id: string,
  classes: readonly string[],
  shaped: ShapedText,
  x: number,
  y: number,
  style: TextStyle,
  engine: TextEngine,
): TextItem {
  return {
    kind: 'text',
    id,
    parent: 'labels',
    classes,
    text: shaped.text,
    x,
    y,
    anchor: 'middle',
    direction: 'ltr',
    font: { family: style.family, weight: style.weight, size: style.size },
    width: shaped.width,
    outline: engine.outline(shaped, x - shaped.width / 2, y),
    paint: { fill: style.color },
  };
}

/** Plain-language description used as the figure's accessible description (alt text). */
export function describe(model: Model): string {
  const count = model.layers.length;
  const parts = model.layers.map((layer, i) => {
    const name = (layer.name !== undefined && cleanLabel(layer.name)) || autoName(i, count);
    return `${name} (${layer.units} ${layer.units === 1 ? 'neuron' : 'neurons'})`;
  });
  return `Fully connected neural network with ${count} ${count === 1 ? 'layer' : 'layers'}: ${parts.join(', ')}.`;
}
