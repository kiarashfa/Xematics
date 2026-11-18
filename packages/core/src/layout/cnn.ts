// Layout for convolutional networks. Feature maps are stacks of sheets (one per channel, up to
// theme.maps.sheets), slanted to read as 3D; rays from a window on one map to a point on the next
// show what each convolution or pooling step reads. Flat vectors (flatten, dense, global pooling)
// follow the preset: node presets draw neuron columns with edges, Layer boxes draws bars.
// Pure and deterministic: only + - * / and sqrt.

import { diagnostic, type Diagnostic } from '../diagnostics.ts';
import { familyOf, skipOf, type DenseLayer, type Layer, type Model } from '../model/schema.ts';
import { inferShapes, pair, shapeText, type Shape } from '../model/shapes.ts';
import { SCENE_VERSION, type Paint, type SceneItem } from '../scene.ts';
import { roleStroke, type Role, type TextStyle, type Theme } from '../style/theme.ts';
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
import { sequenceAutoNames } from './names.ts';

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
/** Skip connections: the join circle, the gap above the layers and the step between levels. */
const JOIN_R = 7;
const SKIP_GAP = 12;
const SKIP_PITCH = 12;
/** Room a join needs in the gap after its layer. */
const JOIN_ROOM = 2 * JOIN_R + 18;

/** Written over the top bridge of a U-Net. */
const BRIDGE_TEXT = 'copy and concatenate';
/** U-Net layout: indent per level, the shortest bridge, and the space between rows. */
const U_INDENT = 40;
const U_BRIDGE = 70;
const U_ROW_GAP = 34;

/** Layers drawn with the pooling tint: they resample a map and learn nothing. */
const resamples = (layer: Layer) => layer.type === 'pool' || layer.type === 'up';

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
      case 'deconv':
      case 'up':
      case 'dense': {
        const n = (seen[layer.type] = (seen[layer.type] ?? 0) + 1);
        const word = {
          conv: 'Conv',
          pool: 'Pool',
          deconv: 'Deconv',
          up: 'Upsample',
          dense: 'Dense',
        }[layer.type];
        // Numbered only when there is more than one of a kind, like Hidden in fully connected networks.
        return total(layer.type) > 1 ? `${word} ${n}` : word;
      }
      case 'flatten':
        return 'Flatten';
      case 'gap':
        return 'Global pool';
      case 'reshape':
        return 'Reshape';
      case 'input':
        return 'Input';
      default:
        return '';
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
    case 'deconv': {
      const stride = layer.stride === undefined ? '' : pair(layer.stride);
      const strided = stride && (stride[0] !== 1 || stride[1] !== 1);
      return `deconv ${times(layer.kernel)}${strided ? `, stride ${stride[0] === stride[1] ? stride[0] : times(layer.stride!)}` : ''}`;
    }
    case 'up':
      return `up ${times(layer.size)}`;
    case 'reshape':
      return 'reshape';
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
  if (model.layers.some((l) => skipOf(l)?.op === 'concat')) {
    out.push({ text: BRIDGE_TEXT, style: theme.maps.opText });
  }
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
    const rolePaint = role === 'hidden' && resamples(layer) ? maps.pool : theme.roles[role];
    const width = shape.kind === 'map' ? maps.strokeWidth : theme.nodeStrokeWidth;
    const paint: Paint = {
      fill: rolePaint.fill,
      ...(rolePaint === maps.pool
        ? { stroke: rolePaint.stroke, strokeWidth: width }
        : roleStroke(theme, role, width)),
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

  const skips = model.layers.flatMap((layer, target) => {
    const skip = skipOf(layer);
    return skip && skip.from <= target ? [{ source: skip.from - 1, target, op: skip.op }] : [];
  });
  const levels = skips.map(() => 1);
  [...skips.keys()]
    .sort((a, b) => skips[a]!.target - skips[a]!.source - (skips[b]!.target - skips[b]!.source))
    .forEach((k) => {
      const outer = skips[k]!;
      for (const [j, inner] of skips.entries()) {
        const inside =
          j !== k &&
          inner.source >= outer.source &&
          inner.target <= outer.target &&
          inner.target - inner.source < outer.target - outer.source;
        if (inside) levels[k] = Math.max(levels[k]!, levels[j]! + 1);
      }
    });
  const joins = new Set(skips.map((sk) => sk.target));
  const skipBand = skips.length > 0 ? SKIP_GAP + Math.max(...levels) * SKIP_PITCH : 0;

  // Horizontal placement, in the forward (left to right) direction.
  const labelHalf = (p: Part) => Math.max(p.name?.width ?? 0, p.size?.width ?? 0) / 2;
  /** Space between two neighbouring layers on one row: connector, op label and labels. */
  const pairGap = (previous: Part, part: Part) => {
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
    return Math.max(base * scale, opRoom, centers);
  };
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
    const starts = skips.some((sk) => sk.source === i - 1);
    const joinRoom = joins.has(i - 1) ? JOIN_ROOM + (starts ? JOIN_R + 6 : 0) : 0;
    lefts.push(lefts[i - 1]! + previous.extent + Math.max(base * scale, opRoom, centers, joinRoom));
  });
  const last = parts.at(-1)!;
  // A join after the last layer needs room on its right.
  const tail = joins.has(parts.length - 1) ? JOIN_ROOM : 0;
  let width =
    lefts.at(-1)! +
    last.extent +
    Math.max(0, labelHalf(last) - last.extent / 2, tail) +
    theme.margin;

  // Vertical metrics: op labels in a band on top, layers on one center line, names and sizes below.
  const nameLine = engine.shape('', theme.nameText, theme.nameText.size);
  const sizeLine = engine.shape('', theme.sizeText, theme.sizeText.size);
  const opLine = engine.shape('', maps.opText, maps.opText.size);
  const anyOp = parts.some((p) => p.op);
  const opBaseline = theme.margin + opLine.ascent;
  const top = (anyOp ? opBaseline + opLine.descent + theme.labelGap : theme.margin) + skipBand;
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
  let height = (anyName || anySize ? cursor : layersBottom) + theme.margin;

  // Where each layer sits: one center line here; the U-Net layout below gives each row its own.
  const cys = parts.map(() => centerY);
  const nameYs = parts.map(() => nameBaseline);
  const sizeYs = parts.map(() => sizeBaseline);
  const opAt = parts.map((p, i) =>
    p.op && i > 0
      ? { x: (lefts[i - 1]! + parts[i - 1]!.extent + lefts[i]!) / 2, y: opBaseline }
      : undefined,
  );
  /** Whether a layer connects to the one before it on the same row. */
  const linked = parts.map((_, i) => i > 0);
  const elbows: { from: number; to: number; points: [number, number][] }[] = [];
  const bridges: { source: number; target: number; y: number }[] = [];

  const plan = uPlan(skips, parts.length);
  if (plan) {
    // A U-Net: encoder levels down the left, decoder levels up the right, the deepest layers at
    // the bottom; dashed bridges carry each skip across its row.
    const indent = U_INDENT * scale;
    const run = (indices: readonly number[]) => {
      const rel: number[] = [];
      indices.forEach((i, k) => {
        const part = parts[i]!;
        if (k === 0) rel.push(Math.max(0, labelHalf(part) - part.extent / 2));
        else {
          const previous = parts[indices[k - 1]!]!;
          rel.push(rel[k - 1]! + previous.extent + pairGap(previous, part));
        }
      });
      const tailPart = parts[indices.at(-1)!]!;
      const w =
        rel.at(-1)! + tailPart.extent + Math.max(0, labelHalf(tailPart) - tailPart.extent / 2);
      return { indices, rel, w };
    };
    const levels = plan.left.length;
    const lefts_ = plan.left.map(run);
    const rights = plan.right.map(run);
    const bottom = run(plan.bottom);
    const inner = Math.max(
      ...lefts_.map((l, r) => l.w + rights[r]!.w + 2 * r * indent + U_BRIDGE),
      bottom.w + 2 * levels * indent,
    );
    width = inner + 2 * theme.margin;
    const place = (r: ReturnType<typeof run>, offset: number) =>
      r.indices.forEach((i, k) => {
        lefts[i] = offset + r.rel[k]!;
        linked[i] = k > 0;
      });
    lefts_.forEach((l, r) => place(l, theme.margin + r * indent));
    rights.forEach((l, r) => place(l, width - theme.margin - r * indent - l.w));
    place(bottom, (width - bottom.w) / 2);

    // Rows, top to bottom.
    const rows = [...lefts_.map((l, r) => [...l.indices, ...rights[r]!.indices]), bottom.indices];
    const labelsBottom: number[] = [];
    let rowTop = theme.margin;
    rows.forEach((indices) => {
      const rowParts = indices.map((i) => parts[i]!);
      const rowUp = Math.max(...rowParts.map((p) => p.up));
      const rowDown = Math.max(...rowParts.map((p) => p.down));
      const inRowOp = indices.some((i) => parts[i]!.op && linked[i]);
      const band = inRowOp ? opLine.ascent + opLine.descent + theme.labelGap : 0;
      const cy = rowTop + band + rowUp;
      let y = cy + rowDown + theme.labelGap;
      const rowNames = rowParts.flatMap((p) => (p.name ? [p.name] : []));
      let nameY = 0;
      let sizeY = 0;
      if (rowNames.length > 0) {
        nameY = y + Math.max(nameLine.ascent, ...rowNames.map((l) => l.ascent));
        y = nameY + Math.max(nameLine.descent, ...rowNames.map((l) => l.descent)) + theme.lineGap;
      }
      if (rowParts.some((p) => p.size)) {
        sizeY = y + sizeLine.ascent;
        y = sizeY + sizeLine.descent;
      }
      const bottomY = rowNames.length > 0 || rowParts.some((p) => p.size) ? y : cy + rowDown;
      for (const i of indices) {
        cys[i] = cy;
        nameYs[i] = nameY;
        sizeYs[i] = sizeY;
        if (parts[i]!.op && linked[i]) {
          opAt[i] = {
            x: (lefts[i - 1]! + parts[i - 1]!.extent + lefts[i]!) / 2,
            y: rowTop + opLine.ascent,
          };
        }
      }
      labelsBottom.push(bottomY);
      rowTop = bottomY + U_ROW_GAP + opLine.ascent;
    });
    height = labelsBottom.at(-1)! + theme.margin;

    // Elbows between rows: down the left side and into the bottom, up the right side.
    const rowOf = (i: number) => rows.findIndex((indices) => indices.includes(i));
    const centerX = (i: number) => lefts[i]! + parts[i]!.extent / 2;
    const firsts = [...plan.left.slice(1), plan.bottom, ...[...plan.right].reverse()].map(
      (l) => l[0]!,
    );
    for (const to of firsts) {
      const from = to - 1;
      const a = rowOf(from);
      const b = rowOf(to);
      const down = b > a;
      const upper = down ? a : b;
      const mid = labelsBottom[upper]! + U_ROW_GAP / 2 + 2;
      const points: [number, number][] = down
        ? [
            [centerX(from), labelsBottom[a]! + 6],
            [centerX(from), mid],
            [centerX(to), mid],
            [centerX(to), cys[to]! - parts[to]!.up - 4],
          ]
        : [
            [centerX(from), cys[from]! - parts[from]!.up - 4],
            [centerX(from), mid],
            [centerX(to), mid],
            [centerX(to), labelsBottom[b]! + 5],
          ];
      elbows.push({ from, to, points });
      // The step's label sits beside the elbow's last stretch, clear of the lines and labels.
      const op = parts[to]!.op;
      if (op) {
        const [, y0] = points.at(-2)!;
        const [, y1] = points.at(-1)!;
        opAt[to] = {
          x: centerX(to) - op.width / 2 - 7,
          y: (y0 + y1) / 2 + (opLine.ascent - opLine.descent) / 2,
        };
      }
    }
    plan.skips.forEach((skip) =>
      bridges.push({ source: skip.source, target: skip.target, y: cys[skip.source]! }),
    );
  }

  // Right to left flow mirrors every x coordinate.
  const rtl = theme.direction === 'rtl';
  const X = (x: number) => (rtl ? width - x : x);
  const pt = (x: number, y: number) => `${X(x)} ${y}`;
  const polygon = (points: readonly [number, number][]) =>
    `M${points.map(([x, y]) => pt(x, y)).join('L')}Z`;

  // Geometry helpers (forward coordinates).
  const sheetTop = (p: MapPart) => cys[p.index]! - p.h / 2 + p.sy / 2;
  /** A point on sheet s of a map: u runs along the slanted width, v down the height (0 to 1). */
  const onSheet = (p: MapPart, s: number, u: number, v: number): [number, number] => [
    lefts[p.index]! + s * p.gap + u * p.sx,
    sheetTop(p) - u * p.sy + v * p.h,
  ];
  const nodeY = (p: ColumnPart, j: number) =>
    cys[p.index]! + (j - (p.slots.length - 1) / 2) * pitch;
  const columnEnds = (p: ColumnPart): EdgeEnd[] =>
    p.slots.flatMap((slot, j) => (slot === 'ellipsis' ? [] : [{ neuron: slot, y: nodeY(p, j) }]));

  const items: SceneItem[] = [];
  const over: SceneItem[] = [];
  const headTheme: Theme = { ...theme, nodeRadius: r, nodeSpacing: maps.nodeSpacing };

  // Connectors under the layers: edges, fans and arrows.
  parts.forEach((part, i) => {
    const previous = parts[i - 1];
    if (!previous || !linked[i]) return;
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
    const centerY = cys[i]!;
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
      layer.type === 'conv' || layer.type === 'deconv'
        ? pair(layer.kernel)
        : layer.type === 'pool' || layer.type === 'up'
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
            `map-${part.role === 'hidden' && resamples(part.layer) ? 'pool' : part.role}`,
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
        y: cys[part.index]! - part.height / 2,
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

  // U-Net: elbows between rows, and the dashed copy-and-concatenate bridges.
  const rounded = (points: readonly [number, number][], end: number) => {
    // Rounded corners; the last segment stops `end` short of its point (room for the head).
    let d = `M${pt(points[0]![0], points[0]![1])}`;
    for (let k = 1; k < points.length; k++) {
      const [x, y] = points[k]!;
      const [px, py] = points[k - 1]!;
      const next = points[k + 1];
      if (!next) {
        const len = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) || 1;
        d += `L${pt(x - ((x - px) / len) * end, y - ((y - py) / len) * end)}`;
        continue;
      }
      const c = Math.min(
        6,
        Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) / 2,
        Math.sqrt((next[0] - x) * (next[0] - x) + (next[1] - y) * (next[1] - y)) / 2,
      );
      const inLen = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) || 1;
      const outLen = Math.sqrt((next[0] - x) * (next[0] - x) + (next[1] - y) * (next[1] - y)) || 1;
      d +=
        `L${pt(x - ((x - px) / inLen) * c, y - ((y - py) / inLen) * c)}` +
        `Q${pt(x, y)} ${pt(x + ((next[0] - x) / outLen) * c, y + ((next[1] - y) / outLen) * c)}`;
    }
    return d;
  };
  const headAt = (points: readonly [number, number][]) => {
    const [x, y] = points.at(-1)!;
    const [px, py] = points.at(-2)!;
    const len = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) || 1;
    const ux = (x - px) / len;
    const uy = (y - py) / len;
    const bx = x - ux * HEAD_LENGTH;
    const by = y - uy * HEAD_LENGTH;
    return `M${pt(x, y)}L${pt(bx - uy * HEAD_HALF, by + ux * HEAD_HALF)}L${pt(bx + uy * HEAD_HALF, by - ux * HEAD_HALF)}Z`;
  };
  for (const elbow of elbows) {
    const group = `edges-${elbow.from}`;
    const arrow = theme.box.arrow;
    items.push({ kind: 'group', id: group, classes: ['edges'] });
    items.push({
      kind: 'path',
      id: `arrow-${elbow.from}`,
      parent: group,
      classes: ['arrow', 'elbow'],
      d: rounded(elbow.points, HEAD_LENGTH - 1),
      paint: { stroke: arrow.color, strokeWidth: arrow.width, fill: 'none' },
    });
    items.push({
      kind: 'path',
      id: `arrow-${elbow.from}-head`,
      parent: group,
      classes: ['arrow-head'],
      d: headAt(elbow.points),
      paint: { fill: arrow.color },
    });
  }
  if (bridges.length > 0) {
    items.push({ kind: 'group', id: 'bridges', classes: ['bridges'] });
    const color = theme.parts.attention.stroke;
    bridges.forEach((bridge, k) => {
      const points: [number, number][] = [
        [lefts[bridge.source]! + parts[bridge.source]!.extent + ARROW_GAP, bridge.y],
        [lefts[bridge.target]! - ARROW_GAP, bridge.y],
      ];
      items.push({
        kind: 'path',
        id: `bridge-${k}`,
        parent: 'bridges',
        classes: ['bridge'],
        d: rounded(points, HEAD_LENGTH - 1),
        paint: { stroke: color, strokeWidth: 1.3, dash: [5, 4], fill: 'none' },
      });
      items.push({
        kind: 'path',
        id: `bridge-${k}-head`,
        parent: 'bridges',
        classes: ['bridge-head'],
        d: headAt(points),
        paint: { fill: color },
      });
    });
  }

  const bridgeLabel = (() => {
    const top = bridges[0];
    if (!top) return undefined;
    const style: TextStyle = { ...maps.opText, color: theme.parts.attention.stroke };
    const label = buildLabel(BRIDGE_TEXT, style, engine, () => {});
    const x0 = lefts[top.source]! + parts[top.source]!.extent + ARROW_GAP;
    const x1 = lefts[top.target]! - ARROW_GAP;
    if (x1 - x0 < label.width + 12) return undefined;
    return { label, style, x: (x0 + x1) / 2, y: top.y - 6 };
  })();

  // Skip connections: from the gap after the source layer, over the layers, down into a join
  // (+ for add, two bars for concat) in the gap after the target layer.
  if (skips.length > 0 && !plan) {
    items.push({ kind: 'group', id: 'skips', classes: ['skips'] });
    const color = theme.box.arrow.color;
    const lineWidth = theme.box.arrow.width;
    const layersTop = centerY - up;
    const gapAfter = (i: number) =>
      i + 1 < parts.length
        ? (lefts[i]! + parts[i]!.extent + lefts[i + 1]!) / 2
        : lefts[i]! + parts[i]!.extent + JOIN_ROOM / 2;
    skips.forEach((skip, k) => {
      // A skip that starts where another one joins leaves just after the join.
      const x0 = gapAfter(skip.source) + (joins.has(skip.source) ? JOIN_R + 6 : 0);
      const x1 = gapAfter(skip.target);
      const y = layersTop - SKIP_GAP - (levels[k]! - 1) * SKIP_PITCH;
      const end = centerY - JOIN_R - HEAD_LENGTH + 1;
      const c = Math.min(6, (x1 - x0) / 2);
      const t = skip.target;
      const paint: Paint = {
        stroke: color,
        strokeWidth: lineWidth,
        ...(skip.op === 'concat' ? { dash: [5, 4] } : {}),
      };
      items.push({
        kind: 'circle',
        id: `skipdot-${t}`,
        parent: 'skips',
        classes: ['skip-start'],
        cx: X(x0),
        cy: centerY,
        r: 2.4,
        paint: { fill: color },
      });
      items.push({
        kind: 'path',
        id: `skip-${t}`,
        parent: 'skips',
        classes: ['skip', `skip-${skip.op}`],
        d:
          `M${pt(x0, centerY)}L${pt(x0, y + c)}Q${pt(x0, y)} ${pt(x0 + c, y)}` +
          `L${pt(x1 - c, y)}Q${pt(x1, y)} ${pt(x1, y + c)}L${pt(x1, end)}`,
        paint: { ...paint, fill: 'none' },
      });
      const tip = centerY - JOIN_R - 1;
      items.push({
        kind: 'path',
        id: `skip-${t}-head`,
        parent: 'skips',
        classes: ['skip-head'],
        d: `M${pt(x1, tip)}L${pt(x1 - HEAD_HALF, tip - HEAD_LENGTH)}L${pt(x1 + HEAD_HALF, tip - HEAD_LENGTH)}Z`,
        paint: { fill: color },
      });
      items.push({
        kind: 'circle',
        id: `join-${t}`,
        parent: 'skips',
        classes: ['join', `join-${skip.op}`],
        cx: X(x1),
        cy: centerY,
        r: JOIN_R,
        paint: { fill: theme.background ?? '#ffffff', stroke: color, strokeWidth: lineWidth },
      });
      const a = JOIN_R * 0.5;
      items.push({
        kind: 'path',
        id: `join-${t}-sign`,
        parent: 'skips',
        classes: ['join-sign'],
        d:
          skip.op === 'add'
            ? `M${pt(x1 - a, centerY)}L${pt(x1 + a, centerY)}M${pt(x1, centerY - a)}L${pt(x1, centerY + a)}`
            : `M${pt(x1 - 1.6, centerY - a)}L${pt(x1 - 1.6, centerY + a)}M${pt(x1 + 1.6, centerY - a)}L${pt(x1 + 1.6, centerY + a)}`,
        paint: { stroke: color, strokeWidth: lineWidth, fill: 'none' },
      });
    });
  }

  // Labels.
  if (parts.some((p) => p.name || p.size || p.op) || bridgeLabel) {
    items.push({ kind: 'group', id: 'labels', classes: ['labels'] });
    if (bridgeLabel) {
      const { label, style, x, y } = bridgeLabel;
      items.push(
        ...labelItems(
          'bridge-label',
          ['label', 'label-bridge'],
          label,
          X(x),
          y,
          style,
          engine,
          'labels',
        ),
      );
    }
    for (const part of parts) {
      const center = X(lefts[part.index]! + part.extent / 2);
      const op = opAt[part.index];
      if (part.op && op) {
        items.push(
          ...labelItems(
            `op-${part.index}`,
            ['label', 'label-op'],
            part.op,
            X(op.x),
            op.y,
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
            nameYs[part.index]!,
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
            sizeYs[part.index]!,
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

/**
 * A U-Net: every skip stacks (concat) and they nest, outermost first (each source after the
 * last, each target before the last). Rows: the encoder level k on the left, its decoder level on
 * the right; the layers between the innermost source and target at the bottom.
 */
function uPlan(
  skips: readonly { source: number; target: number; op: string }[],
  count: number,
):
  | {
      skips: { source: number; target: number }[];
      left: number[][];
      right: number[][];
      bottom: number[];
    }
  | undefined {
  if (skips.length === 0 || skips.some((sk) => sk.op !== 'concat')) return undefined;
  const sorted = [...skips].sort((a, b) => b.target - b.source - (a.target - a.source));
  for (let k = 1; k < sorted.length; k++) {
    const outer = sorted[k - 1]!;
    const inner = sorted[k]!;
    if (!(inner.source > outer.source && inner.target < outer.target)) return undefined;
  }
  const innermost = sorted.at(-1)!;
  if (innermost.target - innermost.source < 2) return undefined;
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  return {
    skips: sorted,
    left: sorted.map((sk, k) => range(k === 0 ? 0 : sorted[k - 1]!.source + 1, sk.source)),
    right: sorted.map((sk, k) => range(sk.target, k === 0 ? count - 1 : sorted[k - 1]!.target - 1)),
    bottom: range(innermost.source + 1, innermost.target - 1),
  };
}

type Connector = 'rays' | 'fan' | 'edges' | 'arrow';

function connectorKind(from: Part, to: Part): Connector {
  if (from.draw === 'map' && to.draw === 'map') {
    const windowed = ['conv', 'pool', 'deconv', 'up'].includes(to.layer.type);
    return windowed ? 'rays' : 'arrow';
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
  switch (familyOf(model)) {
    case 'mlp':
      return model.layers.map((_, i) => autoName(i, count));
    case 'cnn':
      return cnnAutoNames(model.layers);
    default:
      return sequenceAutoNames(model.layers);
  }
}
