// Layout for convolutional networks. Feature maps are stacks of sheets (one per channel, up to
// theme.maps.sheets), slanted to read as 3D; rays from a window on one map to a point on the next
// show what each convolution or pooling step reads. Flat vectors (flatten, dense, global pooling)
// follow the preset: node presets draw neuron columns with edges, Layer boxes draws bars.
// Pure and deterministic: only + - * / and sqrt.

import { diagnostic, type Diagnostic } from '../diagnostics.ts';
import { isMlp, type DenseLayer, type Layer, type Model } from '../model/schema.ts';
import { inferShapes, pair, shapeText, type Shape } from '../model/shapes.ts';
import { SCENE_VERSION, type Paint, type SceneItem } from '../scene.ts';
import type { Role, TextStyle, Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { barHeight } from './boxes.ts';
import { buildLabel, labelItems, type Label } from './label.ts';
import {
  autoName,
  cleanLabel,
  edgeItems,
  labelReporter,
  MAX_DRAWN_NEURONS,
  nodeLabels,
  roleOf,
  slotsOf,
  type EdgeEnd,
  type LayoutResult,
  type Slot,
} from './mlp.ts';

/** Space between a layer and the arrow next to it, and the arrow head size. */
const ARROW_GAP = 8;
const HEAD_LENGTH = 8;
const HEAD_HALF = 4.5;
/** How far a sheet's top edge slants, relative to the map's width on the page. */
const SLANT_X = 0.42;
const SLANT_Y = 0.26;
/** Base gaps between layers, scaled by layerSpacing / 110. */
const GAP_MAP = 28;
const GAP_FAN = 56;
const GAP_NODES = 66;
const GAP_ARROW = 34;
/** Points on a map's front sheet that fan out to the first neuron column. */
const FAN = [0.1, 0.3, 0.5, 0.7, 0.9];

/** The name shown under a layer when it has none of its own. */
export function cnnAutoNames(layers: readonly Layer[]): string[] {
  const count = layers.length;
  const inner = layers.slice(1, -1);
  const total = (type: string) => inner.filter((l) => l.type === type).length;
  const seen: Record<string, number> = {};
  return layers.map((layer, index) => {
    if (index === 0) return 'Input';
    if (index === count - 1) return 'Output';
    switch (layer.type) {
      case 'conv':
      case 'pool':
      case 'dense': {
        const n = (seen[layer.type] = (seen[layer.type] ?? 0) + 1);
        const word = layer.type === 'conv' ? 'Conv' : layer.type === 'pool' ? 'Pool' : 'Dense';
        // Numbered only when there is more than one of a kind, like Hidden in fully connected networks.
        return total(layer.type) > 1 ? `${word} ${n}` : word;
      }
      case 'flatten':
        return 'Flatten';
      case 'gap':
        return 'Global pool';
      case 'input':
        return 'Input';
    }
  });
}

const times = (value: number | readonly [number, number]) => {
  const [h, w] = pair(value);
  return `${h}×${w}`;
};

/** The operation that produces a layer, as shown on the connector before it ('' for none). */
export function opText(layer: Layer): string {
  switch (layer.type) {
    case 'conv': {
      const stride = layer.stride === undefined ? '' : pair(layer.stride);
      const strided = stride && (stride[0] !== 1 || stride[1] !== 1);
      return `conv ${times(layer.kernel)}${strided ? `, stride ${stride[0] === stride[1] ? stride[0] : times(layer.stride!)}` : ''}`;
    }
    case 'pool': {
      const size = pair(layer.size);
      const stride = layer.stride === undefined ? size : pair(layer.stride);
      const strided = stride[0] !== size[0] || stride[1] !== size[1];
      return `${layer.mode === 'avg' ? 'avg' : 'max'} ${times(layer.size)}${strided ? `, stride ${stride[0] === stride[1] ? stride[0] : times(layer.stride!)}` : ''}`;
    }
    case 'flatten':
      return 'flatten';
    case 'gap':
      return 'global avg';
    default:
      return '';
  }
}

export function cnnNameText(layer: Layer, auto: string): string {
  return layer.name === undefined ? auto : cleanLabel(layer.name);
}

/** Every label string a convolutional model draws, with its style, so fonts can load first. */
export function cnnLabels(model: Model, theme: Theme): { text: string; style: TextStyle }[] {
  const { shapes } = inferShapes(model);
  const auto = cnnAutoNames(model.layers);
  const out: { text: string; style: TextStyle }[] = [];
  model.layers.forEach((layer, i) => {
    const name = cnnNameText(layer, auto[i]!);
    if (theme.labels.names && name) out.push({ text: name, style: theme.nameText });
    if (theme.labels.sizes) out.push({ text: shapeText(shapes[i]!), style: theme.sizeText });
    const op = opText(layer);
    if (theme.labels.ops && op && i > 0) out.push({ text: op, style: theme.maps.opText });
  });
  return out;
}

interface Base {
  readonly index: number;
  readonly layer: Layer;
  readonly shape: Shape;
  readonly role: Role;
  readonly paint: Paint;
  /** Drawn width (forward direction) and how far the layer reaches above and below the center line. */
  readonly extent: number;
  readonly up: number;
  readonly down: number;
  readonly name: Label | undefined;
  readonly size: Label | undefined;
  readonly op: Label | undefined;
}
interface MapPart extends Base {
  readonly draw: 'map';
  readonly h: number;
  readonly w: number;
  readonly sx: number;
  readonly sy: number;
  readonly count: number;
  readonly gap: number;
}
interface ColumnPart extends Base {
  readonly draw: 'column';
  readonly dense: DenseLayer;
  readonly slots: readonly Slot[];
}
interface BarPart extends Base {
  readonly draw: 'bar';
  readonly height: number;
}
type Part = MapPart | ColumnPart | BarPart;

export function layoutCnn(model: Model, theme: Theme, engine: TextEngine): LayoutResult {
  const diagnostics: Diagnostic[] = [];
  const inferred = inferShapes(model);
  diagnostics.push(...inferred.diagnostics);
  const shapes = inferred.shapes;
  const count = model.layers.length;
  const auto = cnnAutoNames(model.layers);
  const maps = theme.maps;
  const r = maps.nodeRadius;
  const pitch = 2 * r + maps.nodeSpacing;
  const scale = theme.layerSpacing / 110;

  // Sheet sizes follow the square root of the map size, scaled so the largest map is maps.face tall.
  const largest = Math.max(
    1,
    ...shapes.flatMap((s) => (s.kind === 'map' ? [Math.max(s.h, s.w)] : [])),
  );
  const unit = maps.face / Math.sqrt(largest);
  const side = (n: number) => Math.max(maps.minFace, unit * Math.sqrt(n));

  const parts: Part[] = model.layers.map((layer, index) => {
    const shape = shapes[index]!;
    const role = roleOf(index, count);
    const rolePaint = role === 'hidden' && layer.type === 'pool' ? maps.pool : theme.roles[role];
    const paint: Paint = {
      fill: rolePaint.fill,
      stroke: rolePaint.stroke,
      strokeWidth: shape.kind === 'map' ? maps.strokeWidth : theme.nodeStrokeWidth,
    };
    const nameValue = cnnNameText(layer, auto[index]!);
    const name =
      theme.labels.names && nameValue
        ? buildLabel(nameValue, theme.nameText, engine, labelReporter(index, 'name', diagnostics))
        : undefined;
    const size = theme.labels.sizes
      ? buildLabel(shapeText(shape), theme.sizeText, engine, () => {})
      : undefined;
    const opValue = index > 0 && theme.labels.ops ? opText(layer) : '';
    const op = opValue ? buildLabel(opValue, maps.opText, engine, () => {}) : undefined;
    const base = { index, layer, shape, role, paint, name, size, op };

    if (shape.kind === 'map') {
      const h = side(shape.h);
      const w = side(shape.w);
      const sx = SLANT_X * w;
      const sy = SLANT_Y * w;
      const sheets = Math.min(shape.c, maps.sheets);
      const depth = 3 + 2.1 * Math.sqrt(shape.c);
      const gap = sheets > 1 ? Math.min(5, 2 + depth / 6) : 0;
      return {
        ...base,
        draw: 'map',
        h,
        w,
        sx,
        sy,
        count: sheets,
        gap,
        extent: sx + (sheets - 1) * gap,
        up: h / 2 + sy / 2,
        down: h / 2 + sy / 2,
      };
    }
    if (theme.mode === 'boxes') {
      const height = barHeight(shape.n, theme);
      const width = theme.box.width / 2;
      return { ...base, draw: 'bar', height, extent: width, up: height / 2, down: height / 2 };
    }
    const dense: DenseLayer = layer.type === 'dense' ? layer : { type: 'dense', units: shape.n };
    const { slots, forced } = slotsOf(dense, theme);
    if (forced) {
      diagnostics.push(
        diagnostic(
          'warning',
          'layout.forced-collapse',
          `Layer ${index + 1} has ${shape.n} neurons, more than the ${MAX_DRAWN_NEURONS} that can be drawn one by one, so it is collapsed.`,
          { path: ['layers', index, 'collapse'] },
        ),
      );
    }
    const half = ((slots.length - 1) * pitch) / 2 + r;
    return { ...base, draw: 'column', dense, slots, extent: 2 * r, up: half, down: half };
  });

  // Horizontal placement, in the forward (left to right) direction.
  const labelHalf = (p: Part) => Math.max(p.name?.width ?? 0, p.size?.width ?? 0) / 2;
  const lefts: number[] = [];
  parts.forEach((part, i) => {
    const previous = parts[i - 1];
    if (!previous) {
      lefts.push(theme.margin + Math.max(0, labelHalf(part) - part.extent / 2));
      return;
    }
    const connector = connectorKind(previous, part);
    const base =
      connector === 'rays'
        ? GAP_MAP
        : connector === 'fan'
          ? GAP_FAN
          : connector === 'edges'
            ? GAP_NODES
            : GAP_ARROW;
    const opRoom = part.op ? part.op.width + theme.labelPadding : 0;
    const centers =
      labelHalf(previous) +
      labelHalf(part) +
      theme.labelPadding -
      (previous.extent + part.extent) / 2;
    lefts.push(lefts[i - 1]! + previous.extent + Math.max(base * scale, opRoom, centers));
  });
  const last = parts.at(-1)!;
  const width =
    lefts.at(-1)! + last.extent + Math.max(0, labelHalf(last) - last.extent / 2) + theme.margin;

  // Vertical metrics: op labels in a band on top, layers on one center line, names and sizes below.
  const nameLine = engine.shape('', theme.nameText, theme.nameText.size);
  const sizeLine = engine.shape('', theme.sizeText, theme.sizeText.size);
  const opLine = engine.shape('', maps.opText, maps.opText.size);
  const anyOp = parts.some((p) => p.op);
  const opBaseline = theme.margin + opLine.ascent;
  const top = anyOp ? opBaseline + opLine.descent + theme.labelGap : theme.margin;
  const up = Math.max(...parts.map((p) => p.up));
  const down = Math.max(...parts.map((p) => p.down));
  const centerY = top + up;
  const layersBottom = centerY + down;
  const names = parts.flatMap((p) => (p.name ? [p.name] : []));
  const anyName = names.length > 0;
  const anySize = parts.some((p) => p.size);
  let cursor = layersBottom + theme.labelGap;
  let nameBaseline = 0;
  let sizeBaseline = 0;
  if (anyName) {
    nameBaseline = cursor + Math.max(nameLine.ascent, ...names.map((l) => l.ascent));
    cursor =
      nameBaseline + Math.max(nameLine.descent, ...names.map((l) => l.descent)) + theme.lineGap;
  }
  if (anySize) {
    sizeBaseline = cursor + sizeLine.ascent;
    cursor = sizeBaseline + sizeLine.descent;
  }
  const height = (anyName || anySize ? cursor : layersBottom) + theme.margin;

  // Right to left flow mirrors every x coordinate.
  const rtl = theme.direction === 'rtl';
  const X = (x: number) => (rtl ? width - x : x);
  const pt = (x: number, y: number) => `${X(x)} ${y}`;
  const polygon = (points: readonly [number, number][]) =>
    `M${points.map(([x, y]) => pt(x, y)).join('L')}Z`;

  // Geometry helpers (forward coordinates).
  const sheetTop = (p: MapPart) => centerY - p.h / 2 + p.sy / 2;
  /** A point on sheet s of a map: u runs along the slanted width, v down the height (0 to 1). */
  const onSheet = (p: MapPart, s: number, u: number, v: number): [number, number] => [
    lefts[p.index]! + s * p.gap + u * p.sx,
    sheetTop(p) - u * p.sy + v * p.h,
  ];
  const nodeY = (p: ColumnPart, j: number) => centerY + (j - (p.slots.length - 1) / 2) * pitch;
  const columnEnds = (p: ColumnPart): EdgeEnd[] =>
    p.slots.flatMap((slot, j) => (slot === 'ellipsis' ? [] : [{ neuron: slot, y: nodeY(p, j) }]));

  const items: SceneItem[] = [];
  const over: SceneItem[] = [];
  const headTheme: Theme = { ...theme, nodeRadius: r, nodeSpacing: maps.nodeSpacing };

  // Connectors under the layers: edges, fans and arrows.
  parts.forEach((part, i) => {
    const previous = parts[i - 1];
    if (!previous) return;
    const from = i - 1;
    const connector = connectorKind(previous, part);
    if (connector === 'edges' && previous.draw === 'column' && part.draw === 'column') {
      const x1 = X(lefts[from]! + r);
      const x2 = X(lefts[i]! + r);
      items.push(
        ...edgeItems(from, columnEnds(previous), columnEnds(part), x1, x2, r, theme, diagnostics),
      );
      return;
    }
    if (connector === 'fan' && previous.draw === 'map' && part.draw === 'column') {
      const group = `edges-${from}`;
      items.push({ kind: 'group', id: group, classes: ['edges'] });
      const paint: Paint = { stroke: theme.edge.color, strokeWidth: theme.edge.width };
      const cx = lefts[i]! + r;
      FAN.forEach((v, k) => {
        const [ax, ay] = onSheet(previous, previous.count - 1, 1, v);
        for (const end of columnEnds(part)) {
          const dx = cx - ax;
          const dy = end.y - ay;
          const length = Math.sqrt(dx * dx + dy * dy);
          items.push({
            kind: 'line',
            id: `fan-${from}-${k}-${end.neuron}`,
            parent: group,
            classes: ['edge', 'fan'],
            x1: X(ax),
            y1: ay,
            x2: X(cx - (dx / length) * r),
            y2: end.y - (dy / length) * r,
            paint,
          });
        }
      });
      return;
    }
    if (connector === 'rays' && previous.draw === 'map' && part.draw === 'map') {
      over.push(...rayItems(previous, part, i));
      return;
    }
    // Arrow on the center line.
    const group = `edges-${from}`;
    const start = lefts[from]! + previous.extent + ARROW_GAP;
    const tip = lefts[i]! - ARROW_GAP;
    const back = tip - HEAD_LENGTH;
    const arrow = theme.box.arrow;
    const sign = rtl ? -1 : 1;
    items.push({ kind: 'group', id: group, classes: ['edges'] });
    items.push({
      kind: 'line',
      id: `arrow-${from}`,
      parent: group,
      classes: ['arrow'],
      x1: X(start),
      y1: centerY,
      x2: X(back) + sign,
      y2: centerY,
      paint: { stroke: arrow.color, strokeWidth: arrow.width },
    });
    items.push({
      kind: 'path',
      id: `arrow-${from}-head`,
      parent: group,
      classes: ['arrow-head'],
      d: `M${pt(tip, centerY)}L${pt(back, centerY - HEAD_HALF)}L${pt(back, centerY + HEAD_HALF)}Z`,
      paint: { fill: arrow.color },
    });
  });

  function rayItems(source: MapPart, target: MapPart, i: number): SceneItem[] {
    const layer = target.layer;
    const [kh, kw] =
      layer.type === 'conv'
        ? pair(layer.kernel)
        : layer.type === 'pool'
          ? pair(layer.size)
          : [3, 3];
    const shape = source.shape.kind === 'map' ? source.shape : { h: 1, w: 1 };
    const clamp = (value: number) => Math.min(0.5, Math.max(0.16, value));
    const ku = clamp(kw / shape.w);
    const kv = clamp(kh / shape.h);
    const u0 = 0.5 - ku / 2;
    const v0 = 0.5 - kv / 2;
    const s = source.count - 1;
    const corners: [number, number][] = [
      onSheet(source, s, u0, v0),
      onSheet(source, s, u0 + ku, v0),
      onSheet(source, s, u0 + ku, v0 + kv),
      onSheet(source, s, u0, v0 + kv),
    ];
    const [tx, ty] = onSheet(target, 0, 0.5, 0.5);
    const group = `rays-${i}`;
    const ray: Paint = { stroke: maps.ray.color, strokeWidth: maps.ray.width };
    return [
      { kind: 'group', id: group, classes: ['rays'] },
      {
        kind: 'path',
        id: `window-${i}`,
        parent: group,
        classes: ['window'],
        d: polygon(corners),
        paint: { fill: maps.window, stroke: source.paint.stroke!, strokeWidth: 1 },
      },
      ...corners.map(([x, y], k): SceneItem => ({
        kind: 'line',
        id: `ray-${i}-${k}`,
        parent: group,
        classes: ['ray'],
        x1: X(x),
        y1: y,
        x2: X(tx),
        y2: ty,
        paint: ray,
      })),
      {
        kind: 'circle',
        id: `raydot-${i}`,
        parent: group,
        classes: ['ray-end'],
        cx: X(tx),
        cy: ty,
        r: 1.8,
        paint: { fill: maps.ray.color },
      },
    ];
  }

  // Layers.
  for (const part of parts) {
    const group = `layer-${part.index}`;
    items.push({ kind: 'group', id: group, classes: ['layer', `layer-${part.role}`] });
    if (part.draw === 'map') {
      for (let s = 0; s < part.count; s++) {
        const front = s === part.count - 1;
        items.push({
          kind: 'path',
          id: `sheet-${part.index}-${s}`,
          parent: group,
          classes: [
            'sheet',
            `map-${part.role === 'hidden' && part.layer.type === 'pool' ? 'pool' : part.role}`,
          ],
          d: polygon([
            onSheet(part, s, 0, 0),
            onSheet(part, s, 1, 0),
            onSheet(part, s, 1, 1),
            onSheet(part, s, 0, 1),
          ]),
          paint: front
            ? part.paint
            : { ...part.paint, strokeWidth: part.paint.strokeWidth! * 0.75 },
        });
      }
    } else if (part.draw === 'bar') {
      const x = lefts[part.index]!;
      items.push({
        kind: 'rect',
        id: `box-${part.index}`,
        parent: group,
        classes: ['box', `box-${part.role}`],
        x: rtl ? width - x - part.extent : x,
        y: centerY - part.height / 2,
        width: part.extent,
        height: part.height,
        rx: theme.box.radius / 2,
        paint: part.paint,
      });
    } else {
      const x = X(lefts[part.index]! + r);
      part.slots.forEach((slot, j) => {
        const y = nodeY(part, j);
        if (slot !== 'ellipsis') {
          items.push({
            kind: 'circle',
            id: `node-${part.index}-${slot}`,
            parent: group,
            classes: ['node', `node-${part.role}`],
            cx: x,
            cy: y,
            r,
            paint: part.paint,
          });
          return;
        }
        const id = `ellipsis-${part.index}`;
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
      if (part.layer.type === 'dense') {
        items.push(
          ...nodeLabels(
            part.dense,
            { index: part.index, role: part.role, slots: part.slots },
            x,
            (j) => nodeY(part, j),
            headTheme,
            engine,
            diagnostics,
          ),
        );
      }
    }
  }

  items.push(...over);

  // Labels.
  if (parts.some((p) => p.name || p.size || p.op)) {
    items.push({ kind: 'group', id: 'labels', classes: ['labels'] });
    for (const part of parts) {
      const center = X(lefts[part.index]! + part.extent / 2);
      if (part.op) {
        const previous = parts[part.index - 1]!;
        const mid = X((lefts[part.index - 1]! + previous.extent + lefts[part.index]!) / 2);
        items.push(
          ...labelItems(
            `op-${part.index}`,
            ['label', 'label-op'],
            part.op,
            mid,
            opBaseline,
            maps.opText,
            engine,
            'labels',
          ),
        );
      }
      if (part.name) {
        items.push(
          ...labelItems(
            `name-${part.index}`,
            ['label', 'label-name'],
            part.name,
            center,
            nameBaseline,
            theme.nameText,
            engine,
            'labels',
          ),
        );
      }
      if (part.size) {
        items.push(
          ...labelItems(
            `size-${part.index}`,
            ['label', 'label-size'],
            part.size,
            center,
            sizeBaseline,
            theme.sizeText,
            engine,
            'labels',
          ),
        );
      }
    }
  }

  return {
    scene: {
      version: SCENE_VERSION,
      width,
      height,
      background: theme.background,
      title: cleanLabel(model.title ?? '') || 'Neural network diagram',
      description: cleanLabel(model.description ?? '') || describeCnn(model),
      items,
    },
    diagnostics,
  };
}

type Connector = 'rays' | 'fan' | 'edges' | 'arrow';

function connectorKind(from: Part, to: Part): Connector {
  if (from.draw === 'map' && to.draw === 'map') {
    return to.layer.type === 'conv' || to.layer.type === 'pool' ? 'rays' : 'arrow';
  }
  if (from.draw === 'map' && to.draw === 'column') return 'fan';
  if (from.draw === 'column' && to.draw === 'column') return 'edges';
  return 'arrow';
}

/** Plain-language description used as the figure's accessible description (alt text). */
export function describeCnn(model: Model): string {
  const { shapes } = inferShapes(model);
  const auto = cnnAutoNames(model.layers);
  const parts = model.layers.map((layer, i) => {
    const name = (layer.name !== undefined && cleanLabel(layer.name)) || auto[i]!;
    const shape = shapes[i]!;
    const op = opText(layer);
    const out =
      shape.kind === 'map' ? shapeText(shape) : `${shape.n} ${shape.n === 1 ? 'value' : 'values'}`;
    return `${name} (${op ? `${op}, ` : ''}${out})`;
  });
  const count = model.layers.length;
  return `Convolutional neural network with ${count} ${count === 1 ? 'layer' : 'layers'}: ${parts.join(', ')}.`;
}

/** The automatic name of every layer, for fully connected and convolutional models alike. */
export function autoNames(model: Model): string[] {
  const count = model.layers.length;
  return isMlp(model) ? model.layers.map((_, i) => autoName(i, count)) : cnnAutoNames(model.layers);
}
