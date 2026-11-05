// Layout for recurrent networks (RNN, LSTM, GRU). The default look unrolls the network over time:
// one column per time step, layers as rows from the input at the bottom to the output on top,
// and the state passed along each recurrent row (LSTM draws two lines, the cell state c and the
// output h). The 'neurons' look draws each step as a small network of nodes instead, and the
// cell switch draws the gates inside one cell. Pure and deterministic: only + - * / and sqrt.

import {
  isRecurrent,
  type Layer,
  type Model,
  type RecurrentLayer,
  type RecurrentType,
} from '../model/schema.ts';
import { inferShapes, shapeText, type Shape } from '../model/shapes.ts';
import type { Paint } from '../scene.ts';
import type { Role, RolePaint, TextStyle, Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { Painter, type Point } from './draw.ts';
import type { Label } from './label.ts';
import { cleanLabel, labelReporter, roleOf, slotsOf, type LayoutResult, type Slot } from './mlp.ts';

const CELL_WORD: Readonly<Record<RecurrentType, string>> = { rnn: 'RNN', lstm: 'LSTM', gru: 'GRU' };
const CELL_H = 38;
const BOX_H = 30;
/** Length of the initial-state stub before the first cell. */
const STUB = 30;
/** Padding of the dashed frame around a recurrent row in the neurons look. */
const FRAME_PAD = 7;

/** The cell's name with a Bi prefix for bidirectional layers: BiLSTM. */
export function cellWord(layer: RecurrentLayer): string {
  return `${layer.bidirectional ? 'Bi' : ''}${CELL_WORD[layer.type]}`;
}

/** The name shown for each layer of a sequence model (recurrent or Transformer) without its own. */
export function sequenceAutoNames(layers: readonly Layer[]): string[] {
  const count = layers.length;
  const words = layers.map((layer, i) => {
    switch (layer.type) {
      case 'sequence':
      case 'input':
        return 'Input';
      case 'tokens':
        return 'Tokens';
      case 'embed':
        return 'Embedding';
      case 'encoder':
        return 'Encoder';
      case 'decoder':
        return 'Decoder';
      case 'rnn':
      case 'lstm':
      case 'gru':
        return cellWord(layer);
      case 'flatten':
        return 'Flatten';
      case 'gap':
        return 'Pooling';
      case 'gan':
        return 'GAN';
      case 'autoencoder':
        return layer.vae ? 'VAE' : 'Autoencoder';
      default:
        return i === count - 1 ? 'Output' : 'Dense';
    }
  });
  const totals: Record<string, number> = {};
  for (const word of words) totals[word] = (totals[word] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return words.map((word) => {
    // Numbered only when there is more than one of a kind, like Hidden in fully connected networks.
    if ((totals[word] ?? 0) < 2) return word;
    seen[word] = (seen[word] ?? 0) + 1;
    return `${word} ${seen[word]}`;
  });
}

export const layerNameText = (layer: Layer, auto: string) =>
  layer.name === undefined ? auto : cleanLabel(layer.name);

/** The word inside a box that stands for a layer at one step. */
function boxWord(layer: Layer): string {
  switch (layer.type) {
    case 'rnn':
    case 'lstm':
    case 'gru':
      return CELL_WORD[layer.type];
    case 'embed':
      return 'Embed';
    case 'flatten':
      return 'Flatten';
    case 'gap':
      return 'Pool';
    default:
      return 'Dense';
  }
}

/** Values per step shown in a row's size label (one direction of a bidirectional layer). */
function perStepSize(layer: Layer, shape: Shape): number {
  if (isRecurrent(layer)) return layer.units;
  if (shape.kind === 'seq') return shape.tokens ? shape.steps : shape.n;
  return shape.kind === 'vector' ? shape.n : shape.c;
}

interface Column {
  /** The step drawn (0-based), or the gap standing for the steps left out. */
  readonly step: number | 'gap';
  readonly x: number;
  readonly last: boolean;
}

interface Row {
  readonly index: number;
  readonly layer: Layer;
  readonly dir?: 'f' | 'b' | undefined;
  readonly kind: 'input' | 'cell' | 'box' | 'output';
  readonly role: Role;
  readonly paint: RolePaint;
  readonly name: Label | undefined;
  readonly size: Label | undefined;
  y: number;
}

/** Shared setup of both looks: shapes, names, which layer appears in which column. */
function prepare(model: Model, theme: Theme, painter: Painter) {
  const inferred = inferShapes(model);
  painter.diagnostics.push(...inferred.diagnostics);
  const shapes = inferred.shapes;
  const layers = model.layers;
  const count = layers.length;
  const auto = sequenceAutoNames(layers);
  const first = shapes[0];
  const steps = first?.kind === 'seq' ? first.steps : 1;
  const drawn = Math.min(steps, theme.steps);
  const isSeq = (i: number) => shapes[i]?.kind === 'seq';
  /** Whether layer i has something at every step, or only at the last one. */
  const perStep = (i: number) => i === 0 || (isRecurrent(layers[i]!) ? isSeq(i - 1) : isSeq(i));
  const present = (i: number, last: boolean) => perStep(i) || last;
  const linked = (i: number, last: boolean) =>
    present(i - 1, last) && present(i, last) && (i - 1 === 0 || isSeq(i - 1) || last);
  const steplist: (number | 'gap')[] =
    steps <= drawn
      ? Array.from({ length: steps }, (_, t) => t)
      : [...Array.from({ length: drawn - 1 }, (_, t) => t), 'gap', steps - 1];

  const rows: Row[] = [];
  layers.forEach((layer, index) => {
    const role = roleOf(index, count);
    const paint = theme.roles[role];
    const nameValue = layerNameText(layer, auto[index]!);
    const report = labelReporter(index, 'name', painter.diagnostics);
    const size = theme.labels.sizes
      ? painter.measure(String(perStepSize(layer, shapes[index]!)), theme.sizeText)
      : undefined;
    const kind: Row['kind'] =
      index === 0 ? 'input' : isRecurrent(layer) ? 'cell' : index === count - 1 ? 'output' : 'box';
    if (isRecurrent(layer) && layer.bidirectional) {
      const named = layer.name !== undefined;
      for (const dir of ['f', 'b'] as const) {
        const text = named
          ? `${nameValue} ${dir === 'f' ? '→' : '←'}`
          : dir === 'f'
            ? 'Forward'
            : 'Backward';
        const name =
          theme.labels.names && nameValue
            ? painter.measure(text, theme.nameText, report)
            : undefined;
        rows.push({ index, layer, dir, kind, role, paint, name, size, y: 0 });
      }
      return;
    }
    const name =
      theme.labels.names && nameValue
        ? painter.measure(nameValue, theme.nameText, report)
        : undefined;
    rows.push({ index, layer, kind, role, paint, name, size, y: 0 });
  });
  return { shapes, steps, steplist, rows, present, linked, auto };
}

export function layoutRnn(model: Model, theme: Theme, engine: TextEngine): LayoutResult {
  const painter = new Painter(theme, engine, []);
  const scene = theme.cell
    ? cellFigure(model, theme, painter)
    : theme.recurrent === 'neurons'
      ? neuronsLook(model, theme, painter)
      : unrolledLook(model, theme, painter);
  return { scene, diagnostics: painter.diagnostics };
}

/** Left labels (name over size) for every row, right-aligned at x. */
function rowLabels(painter: Painter, rows: readonly Row[], x: number): void {
  const theme = painter.theme;
  const nameLine = painter.engine.shape('', theme.nameText, theme.nameText.size);
  const sizeLine = painter.engine.shape('', theme.sizeText, theme.sizeText.size);
  for (const row of rows) {
    const suffix = row.dir === 'b' ? '-b' : '';
    const both = row.name && row.size;
    const block = both
      ? nameLine.ascent + nameLine.descent + theme.lineGap + sizeLine.ascent + sizeLine.descent
      : 0;
    const top = row.y - block / 2;
    if (row.name) {
      const baseline = both
        ? top + nameLine.ascent
        : row.y + (row.name.ascent - row.name.descent) / 2;
      painter.label(`name-${row.index}${suffix}`, row.name, x, baseline, theme.nameText, {
        anchor: 'end',
        classes: ['label', 'label-name'],
      });
    }
    if (row.size) {
      const baseline = both
        ? top + nameLine.ascent + nameLine.descent + theme.lineGap + sizeLine.ascent
        : row.y + (row.size.ascent - row.size.descent) / 2;
      painter.label(`size-${row.index}${suffix}`, row.size, x, baseline, theme.sizeText, {
        anchor: 'end',
        classes: ['label', 'label-size'],
      });
    }
  }
}

const labelColumn = (rows: readonly Row[]) =>
  Math.max(0, ...rows.map((r) => Math.max(r.name?.width ?? 0, r.size?.width ?? 0)));

function unrolledLook(model: Model, theme: Theme, painter: Painter) {
  const { shapes, steps, steplist, rows, present, linked } = prepare(model, theme, painter);
  const engine = painter.engine;
  const r = theme.nodeRadius;
  const textStyle = (paint: RolePaint): TextStyle => ({ ...theme.parts.text, color: paint.text });
  const wordWidth = Math.max(
    ...rows.map(
      (row) => engine.shape(boxWord(row.layer), textStyle(row.paint), theme.parts.text.size).width,
    ),
  );
  const bi = rows.some((row) => row.dir);
  const cw = Math.max(64, wordWidth + 20);
  const cwBi = Math.max(50, wordWidth + 16);
  const off = bi ? cwBi / 2 + 5 : 0;
  const pitch = Math.max(
    bi ? 2 * cwBi + 32 : cw + 40,
    (theme.layerSpacing * 104) / 110 - (bi ? 0 : 6),
  );
  const widthOf = (row: Row) => (row.dir ? cwBi : cw);
  const half = (row: Row) =>
    row.kind === 'cell' ? CELL_H / 2 : row.kind === 'box' ? BOX_H / 2 : r;
  const shift = (row: Row) => (row.dir === 'f' ? -off : row.dir === 'b' ? off : 0);
  const reach = (row: Row) =>
    row.kind === 'input' || row.kind === 'output' ? r : Math.abs(shift(row)) + widthOf(row) / 2;

  // State labels: h₀ (and c₀ for LSTM) before the first cell, h with T+1 after a backward row.
  const opText = theme.maps.opText;
  const stateNames = (row: Row) => (row.layer.type === 'lstm' ? ['c', 'h'] : ['h']);
  const cellRows = rows.filter((row) => row.kind === 'cell');
  const stateSub = (row: Row) => String(row.dir === 'b' ? steps + 1 : 0);
  const stateWidth = (dir: 'f' | 'b') =>
    Math.max(
      0,
      ...cellRows
        .filter((row) => (row.dir ?? 'f') === dir)
        .flatMap((row) =>
          stateNames(row).map((l) => painter.subscriptWidth(l, stateSub(row), opText)),
        ),
    );
  const before = cellRows.some((row) => row.dir !== 'b') ? stateWidth('f') + 4 + STUB : 0;
  const after = cellRows.some((row) => row.dir === 'b') ? stateWidth('b') + 4 + STUB : 0;

  const labW = labelColumn(rows);
  const labelX = theme.margin + labW;
  const x0 = labelX + (labW > 0 ? theme.labelPadding : 0) + before + Math.max(...rows.map(reach));
  const columns: Column[] = [];
  let x = x0;
  steplist.forEach((step, k) => {
    if (k > 0) x += step === 'gap' || steplist[k - 1] === 'gap' ? pitch * 0.72 : pitch;
    columns.push({ step, x, last: k === steplist.length - 1 });
  });
  const lastX = columns.at(-1)!.x;
  const width = lastX + Math.max(...rows.map(reach)) + after + theme.margin;

  const rowGap = Math.max(CELL_H + 28, (72 * theme.layerSpacing) / 110);
  const topHalf = half(rows.at(-1)!);
  rows.forEach((row, k) => {
    row.y = theme.margin + topHalf + (rows.length - 1 - k) * rowGap;
  });
  const height = rows[0]!.y + half(rows[0]!) + theme.margin;

  const arrow = theme.box.arrow;
  const line = theme.parts.line;
  const stepName = (col: Column) => (col.step === 'gap' ? 0 : col.step + 1);
  const at = (row: Row, col: Column) => col.x + shift(row);

  // Data flow between layers, under everything.
  rows.forEach((dst) => {
    if (dst.index === 0) return;
    const sources = rows.filter((row) => row.index === dst.index - 1);
    if (dst.dir === 'b') return; // drawn together with the forward row below
    const targets = rows.filter((row) => row.index === dst.index);
    painter.group(`edges-${dst.index - 1}`, ['edges']);
    columns.forEach((col) => {
      if (col.step === 'gap' || !linked(dst.index, col.last)) return;
      let k = 0;
      for (const src of sources) {
        for (const target of targets) {
          painter.arrow(
            `arrow-${dst.index - 1}-${col.step}-${k++}`,
            [
              [at(src, col), src.y - half(src)],
              [at(target, col), target.y + half(target)],
            ],
            arrow.color,
            arrow.width,
            { parent: `edges-${dst.index - 1}`, classes: ['arrow'] },
          );
        }
      }
    });
  });

  // Layers: cells, boxes and circles, with the state passed along recurrent rows.
  const drawnLayers = new Set<number>();
  for (const row of rows) {
    const group = `layer-${row.index}`;
    if (!drawnLayers.has(row.index)) {
      painter.group(group, ['layer', `layer-${row.role}`]);
      drawnLayers.add(row.index);
    }
    const suffix = row.dir === 'b' ? '-b' : '';
    const paint: Paint = {
      fill: row.paint.fill,
      stroke: row.paint.stroke,
      strokeWidth: theme.nodeStrokeWidth,
    };
    if (row.kind === 'cell') {
      const offsets = row.layer.type === 'lstm' ? [-8, 8] : [0];
      const letters = stateNames(row);
      const back = row.dir === 'b';
      const sw = widthOf(row);
      for (let k = 0; k + 1 < columns.length; k++) {
        const a = columns[k]!;
        const b = columns[k + 1]!;
        const from = a.step === 'gap' ? at(row, a) + 9 : at(row, a) + sw / 2;
        const to = b.step === 'gap' ? at(row, b) - 9 : at(row, b) - sw / 2;
        offsets.forEach((dy, j) => {
          const points: Point[] = back
            ? [
                [to, row.y + dy],
                [from, row.y + dy],
              ]
            : [
                [from, row.y + dy],
                [to, row.y + dy],
              ];
          painter.arrow(
            `state-${row.index}-${k}-${letters[j]}${suffix}`,
            points,
            line.color,
            line.width,
            {
              parent: group,
              classes: ['state'],
            },
          );
        });
      }
      // Initial state from outside.
      const edge = back ? at(row, columns.at(-1)!) + sw / 2 : at(row, columns[0]!) - sw / 2;
      const dir = back ? 1 : -1;
      offsets.forEach((dy, j) => {
        painter.arrow(
          `state-${row.index}-start-${letters[j]}${suffix}`,
          [
            [edge + dir * STUB, row.y + dy],
            [edge, row.y + dy],
          ],
          line.color,
          line.width,
          { parent: group, classes: ['state'] },
        );
        painter.subscripted(
          `statelabel-${row.index}-${letters[j]}${suffix}`,
          letters[j]!,
          stateSub(row),
          edge + dir * (STUB + 4),
          row.y + dy,
          opText,
          { anchor: back ? 'start' : 'end', classes: ['label', 'label-state'] },
        );
      });
    }
    for (const col of columns) {
      if (!present(row.index, col.last)) continue;
      const cx = at(row, col);
      if (col.step === 'gap') {
        const id = `ellipsis-${row.index}${suffix}`;
        painter.group(id, ['ellipsis'], group);
        [-1, 0, 1].forEach((o, dot) =>
          painter.circle(
            `${id}-${dot}`,
            cx + o * theme.ellipsis.spacing,
            row.y,
            theme.ellipsis.radius,
            {
              fill: theme.ellipsis.color,
            },
            { parent: id },
          ),
        );
        continue;
      }
      if (row.kind === 'input' || row.kind === 'output') {
        painter.circle(`node-${row.index}-${col.step}`, cx, row.y, r, paint, {
          parent: group,
          classes: ['node', `node-${row.role}`],
        });
        const letter = row.kind === 'input' ? 'x' : 'y';
        const vector = row.kind === 'output' && shapes[row.index]?.kind !== 'seq';
        const style = { ...theme.nodeText, color: row.paint.text };
        if (vector) {
          painter.centered(
            `nodelabel-${row.index}-${col.step}`,
            painter.measure(letter, style),
            cx,
            row.y,
            style,
            {
              classes: ['label', 'label-node'],
            },
          );
        } else {
          painter.subscripted(
            `nodelabel-${row.index}-${col.step}`,
            letter,
            String(stepName(col)),
            cx,
            row.y,
            style,
            {
              classes: ['label', 'label-node'],
            },
          );
        }
        continue;
      }
      const w = widthOf(row);
      const h = row.kind === 'cell' ? CELL_H : BOX_H;
      painter.rect(
        `box-${row.index}-${col.step}${suffix}`,
        cx - w / 2,
        row.y - h / 2,
        w,
        h,
        paint,
        {
          parent: group,
          classes: ['box', `box-${row.role}`, row.kind === 'cell' ? 'cell' : 'step'],
          rx: theme.box.radius,
        },
      );
      const style = textStyle(row.paint);
      painter.centered(
        `boxname-${row.index}-${col.step}${suffix}`,
        painter.measure(boxWord(row.layer), style),
        cx,
        row.y,
        style,
        {
          classes: ['label', 'label-box'],
        },
      );
    }
  }

  painter.group('labels', ['labels']);
  rowLabels(painter, rows, labelX);
  return painter.finish(width, height, {
    title: cleanLabel(model.title ?? '') || 'Neural network diagram',
    description: cleanLabel(model.description ?? '') || describeSequence(model),
    family: 'rnn',
  });
}

function neuronsLook(model: Model, theme: Theme, painter: Painter) {
  const { shapes, steplist, rows: allRows, present, linked } = prepare(model, theme, painter);
  // One row per layer: both directions of a bidirectional layer share the same neurons.
  const rows = allRows
    .filter((row) => row.dir !== 'b')
    .map((row) => (row.dir ? { ...row, dir: undefined } : row));
  const bidirectional = (row: Row) => isRecurrent(row.layer) && row.layer.bidirectional === true;
  // Bidirectional rows keep their plain name (not "Forward").
  const auto = sequenceAutoNames(model.layers);
  rows.forEach((row, k) => {
    if (!bidirectional(row) || !theme.labels.names) return;
    const text = layerNameText(row.layer, auto[row.index]!);
    rows[k] = { ...row, name: text ? painter.measure(text, theme.nameText) : undefined };
  });
  const r = theme.maps.nodeRadius;
  const pitchN = 2 * r + Math.max(5, theme.maps.nodeSpacing) + 1;
  const slotsFor = (row: Row): Slot[] => {
    const shape = shapes[row.index]!;
    const units = isRecurrent(row.layer) ? row.layer.units : perStepSize(row.layer, shape);
    return slotsOf({ type: 'dense', units }, theme).slots;
  };
  const slots = rows.map(slotsFor);
  const rowWidth = (k: number) => (slots[k]!.length - 1) * pitchN + 2 * r;
  const stepWidth = Math.max(...rows.map((_, k) => rowWidth(k))) + 2 * FRAME_PAD;
  const pitch = stepWidth + 64;

  const opText = theme.maps.opText;
  const cellRows = rows.filter((row) => row.kind === 'cell');
  const h0 = painter.subscriptWidth('h', '0', opText);
  const before = cellRows.length > 0 ? h0 + 4 + 34 : 0;
  const labW = labelColumn(rows);
  const labelX = theme.margin + labW;
  const x0 = labelX + (labW > 0 ? theme.labelPadding : 0) + before + stepWidth / 2;
  const columns: Column[] = [];
  let x = x0;
  steplist.forEach((step, k) => {
    if (k > 0) x += step === 'gap' || steplist[k - 1] === 'gap' ? pitch * 0.6 : pitch;
    columns.push({ step, x, last: k === steplist.length - 1 });
  });
  const width = columns.at(-1)!.x + stepWidth / 2 + theme.margin;
  const rowGap = Math.max(2 * r + 2 * FRAME_PAD + 40, (80 * theme.layerSpacing) / 110);
  const top = theme.margin + r + FRAME_PAD;
  rows.forEach((row, k) => {
    row.y = top + (rows.length - 1 - k) * rowGap;
  });
  const stepLine = painter.engine.shape('', opText, opText.size);
  const stepBaseline = rows[0]!.y + r + theme.labelGap + stepLine.ascent;
  const height = stepBaseline + stepLine.descent + theme.margin;

  const nodeX = (k: number, col: Column, j: number) =>
    col.x + (j - (slots[k]!.length - 1) / 2) * pitchN;
  const ends = (k: number, col: Column) =>
    slots[k]!.flatMap((slot, j) =>
      slot === 'ellipsis' ? [] : [{ neuron: slot, x: nodeX(k, col, j) }],
    );

  // Connections inside each step.
  rows.forEach((dst, k) => {
    if (k === 0) return;
    const src = rows[k - 1]!;
    const group = `edges-${src.index}`;
    painter.group(group, ['edges']);
    const paint: Paint = { stroke: theme.edge.color, strokeWidth: theme.edge.width };
    for (const col of columns) {
      if (col.step === 'gap' || !linked(dst.index, col.last)) continue;
      for (const a of ends(k - 1, col)) {
        for (const b of ends(k, col)) {
          const dx = b.x - a.x;
          const dy = dst.y - src.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          painter.line(
            `edge-${src.index}-${col.step}-${a.neuron}-${b.neuron}`,
            a.x + (dx / length) * r,
            src.y + (dy / length) * r,
            b.x - (dx / length) * r,
            dst.y - (dy / length) * r,
            paint,
            { parent: group, classes: ['edge'] },
          );
        }
      }
    }
  });

  const line = theme.parts.line;
  rows.forEach((row, k) => {
    const group = `layer-${row.index}`;
    painter.group(group, ['layer', `layer-${row.role}`]);
    const paint: Paint = {
      fill: row.paint.fill,
      stroke: row.paint.stroke,
      strokeWidth: theme.nodeStrokeWidth,
    };
    const half = rowWidth(k) / 2 + FRAME_PAD;
    if (row.kind === 'cell') {
      const both = bidirectional(row);
      for (let c = 0; c + 1 < columns.length; c++) {
        const a = columns[c]!;
        const b = columns[c + 1]!;
        const from = a.step === 'gap' ? a.x + 12 : a.x + half + 2;
        const to = b.step === 'gap' ? b.x - 12 : b.x - half - 2;
        painter.arrow(
          `state-${row.index}-${c}-h`,
          [
            [from, row.y - (both ? 5 : 0)],
            [to, row.y - (both ? 5 : 0)],
          ],
          line.color,
          line.width,
          {
            parent: group,
            classes: ['state'],
          },
        );
        if (both) {
          painter.arrow(
            `state-${row.index}-${c}-h-b`,
            [
              [to, row.y + 5],
              [from, row.y + 5],
            ],
            line.color,
            line.width,
            {
              parent: group,
              classes: ['state'],
            },
          );
        }
      }
      const start = columns[0]!.x - half - 2;
      painter.arrow(
        `state-${row.index}-start-h`,
        [
          [start - 34, row.y],
          [start, row.y],
        ],
        line.color,
        line.width,
        {
          parent: group,
          classes: ['state'],
        },
      );
      painter.subscripted(`statelabel-${row.index}-h`, 'h', '0', start - 38, row.y, opText, {
        anchor: 'end',
        classes: ['label', 'label-state'],
      });
    }
    for (const col of columns) {
      if (!present(row.index, col.last)) continue;
      if (col.step === 'gap') {
        const id = `ellipsis-${row.index}`;
        painter.group(id, ['ellipsis'], group);
        [-1, 0, 1].forEach((o, dot) =>
          painter.circle(
            `${id}-${dot}`,
            col.x + o * theme.ellipsis.spacing,
            row.y,
            theme.ellipsis.radius,
            {
              fill: theme.ellipsis.color,
            },
            { parent: id },
          ),
        );
        continue;
      }
      if (row.kind === 'cell') {
        painter.rect(
          `frame-${row.index}-${col.step}`,
          col.x - half,
          row.y - r - FRAME_PAD,
          2 * half,
          2 * (r + FRAME_PAD),
          {
            fill: 'none',
            stroke: theme.box.arrow.color,
            strokeWidth: 1,
            dash: [3, 3],
          },
          { parent: group, classes: ['frame'], rx: r + 1 },
        );
      }
      slots[k]!.forEach((slot, j) => {
        const cx = nodeX(k, col, j);
        if (slot === 'ellipsis') {
          const id = `ellipsis-${row.index}-${col.step}`;
          painter.group(id, ['ellipsis'], group);
          [-1, 0, 1].forEach((o, dot) =>
            painter.circle(
              `${id}-${dot}`,
              cx + o * theme.ellipsis.spacing,
              row.y,
              theme.ellipsis.radius,
              {
                fill: theme.ellipsis.color,
              },
              { parent: id },
            ),
          );
          return;
        }
        painter.circle(`node-${row.index}-${col.step}-${slot}`, cx, row.y, r, paint, {
          parent: group,
          classes: ['node', `node-${row.role}`],
        });
      });
    }
  });

  painter.group('labels', ['labels']);
  for (const col of columns) {
    const text = col.step === 'gap' ? '…' : `t = ${col.step + 1}`;
    painter.label(`step-${col.step}`, painter.measure(text, opText), col.x, stepBaseline, opText, {
      classes: ['label', 'label-step'],
    });
  }
  rowLabels(painter, rows, labelX);
  return painter.finish(width, height, {
    title: cleanLabel(model.title ?? '') || 'Neural network diagram',
    description: cleanLabel(model.description ?? '') || describeSequence(model),
    family: 'rnn',
  });
}

/** The gates inside one cell of the first recurrent layer (LSTM, GRU or a plain RNN). */
function cellFigure(model: Model, theme: Theme, painter: Painter) {
  const layer = model.layers.find(isRecurrent);
  const type = layer?.type ?? 'rnn';
  const ink = theme.parts.line.color;
  const lw = theme.parts.line.width;
  const thin = lw * 0.9;
  const textStyle = (paint: RolePaint): TextStyle => ({ ...theme.parts.text, color: paint.text });
  const mathStyle: TextStyle = { ...theme.nameText, weight: 400, size: 13 };
  const gateStyle = textStyle(theme.parts.gate);
  const opStyle: TextStyle = { ...theme.parts.text, weight: 400, size: 13, color: ink };
  const small: TextStyle = { ...theme.maps.opText, size: 11 };
  const x0 = 96;
  const y0 = 60;
  const W = type === 'rnn' ? 230 : 330;
  const H = 190;
  const lineTop = y0 + 34;
  const bus = y0 + H - 26;
  const gy = y0 + H - 62;
  const gw = 38;
  const gh = 24;
  const gt = gy - gh / 2;

  painter.group('layer-0', ['layer', 'layer-hidden']);
  painter.rect(
    'cell',
    x0,
    y0,
    W,
    H,
    { fill: theme.parts.frame.fill, stroke: theme.roles.hidden.stroke, strokeWidth: 1.3 },
    {
      parent: 'layer-0',
      classes: ['cell-body'],
      rx: 14,
    },
  );
  painter.group('cell-lines', ['cell-lines']);
  let n = 0;
  const flow = (points: Point[], width = thin) =>
    painter.arrow(`flow-${n++}`, points, ink, width, { parent: 'cell-lines', classes: ['flow'] });
  const plain = (points: Point[], width = thin) => {
    const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('');
    painter.path(
      `wire-${n++}`,
      d,
      { fill: 'none', stroke: ink, strokeWidth: width },
      { parent: 'cell-lines', classes: ['wire'] },
    );
  };
  const ops: [number, number, string][] = [];
  const gates: [number, string, string][] = [];
  const math: [string, number, number, 'start' | 'middle' | 'end', TextStyle?][] = [];

  if (type === 'lstm') {
    const g = [x0 + 62, x0 + 118, x0 + 172, x0 + 232];
    const m2: Point = [g[2]!, y0 + 92];
    const tanhC: Point = [g[3]! + 50, y0 + 66];
    const m3: Point = [g[3]! + 50, y0 + 100];
    flow(
      [
        [x0 - 40, lineTop],
        [g[0]! - 10, lineTop],
      ],
      lw,
    );
    plain(
      [
        [g[0]! + 10, lineTop],
        [g[2]! - 10, lineTop],
      ],
      lw,
    );
    flow(
      [
        [g[2]! + 10, lineTop],
        [x0 + W + 40, lineTop],
      ],
      lw,
    );
    plain([
      [x0 - 40, bus],
      [g[3]!, bus],
    ]);
    flow([
      [x0 + 28, y0 + H + 34],
      [x0 + 28, bus + 1],
    ]);
    for (const x of g)
      flow([
        [x, bus],
        [x, gy + gh / 2],
      ]);
    flow([
      [g[0]!, gt],
      [g[0]!, lineTop + 10],
    ]);
    flow([
      [g[1]!, gt],
      [g[1]!, m2[1]],
      [m2[0] - 10, m2[1]],
    ]);
    flow([
      [g[2]!, gt],
      [g[2]!, m2[1] + 10],
    ]);
    flow([
      [m2[0], m2[1] - 10],
      [m2[0], lineTop + 10],
    ]);
    flow([
      [tanhC[0], lineTop],
      [tanhC[0], tanhC[1] - 10],
    ]);
    flow([
      [tanhC[0], tanhC[1] + 10],
      [m3[0], m3[1] - 10],
    ]);
    flow([
      [g[3]!, gt],
      [g[3]!, m3[1]],
      [m3[0] - 10, m3[1]],
    ]);
    flow(
      [
        [m3[0], m3[1] + 10],
        [m3[0], bus],
        [x0 + W + 40, bus],
      ],
      lw,
    );
    flow(
      [
        [x0 + W - 22, bus],
        [x0 + W - 22, y0 - 30],
      ],
      lw,
    );
    ops.push(
      [g[0]!, lineTop, '×'],
      [g[2]!, lineTop, '+'],
      [m2[0], m2[1], '×'],
      [m3[0], m3[1], '×'],
    );
    gates.push([g[0]!, 'σ', 'f'], [g[1]!, 'σ', 'i'], [g[2]!, 'tanh', 'g'], [g[3]!, 'σ', 'o']);
    painter.rect(
      'op-tanh',
      tanhC[0] - 18,
      tanhC[1] - 10,
      36,
      20,
      { fill: theme.background ?? '#ffffff', stroke: ink, strokeWidth: 1.2 },
      {
        parent: 'layer-0',
        classes: ['op'],
        rx: 10,
      },
    );
    math.push(
      ['c_{t-1}', x0 - 44, lineTop, 'end'],
      ['c_t', x0 + W + 44, lineTop, 'start'],
      ['h_{t-1}', x0 - 44, bus, 'end'],
      ['h_t', x0 + W + 44, bus, 'start'],
      ['x_t', x0 + 28, y0 + H + 46, 'middle'],
      ['h_t', x0 + W - 22, y0 - 40, 'middle'],
    );
    painter.centered(
      'tanh-label',
      painter.measure('tanh', { ...opStyle, size: 10 }),
      tanhC[0],
      tanhC[1],
      { ...opStyle, size: 10 },
      {
        classes: ['label', 'label-op'],
      },
    );
  } else if (type === 'gru') {
    const gr = x0 + 70;
    const gz = x0 + 150;
    const gc = x0 + 232;
    const mA: Point = [gz, lineTop];
    const plus: Point = [gc + 56, lineTop];
    const mB: Point = [gc + 56, y0 + 84];
    const oneMinus: Point = [gz, y0 + 70];
    const mR: Point = [gr, y0 + 86];
    flow(
      [
        [x0 - 40, lineTop],
        [mA[0] - 10, lineTop],
      ],
      lw,
    );
    flow(
      [
        [mA[0] + 10, lineTop],
        [plus[0] - 10, lineTop],
      ],
      lw,
    );
    flow(
      [
        [plus[0] + 10, lineTop],
        [x0 + W + 40, lineTop],
      ],
      lw,
    );
    plain([
      [x0 + 14, lineTop],
      [x0 + 14, bus],
      [gc, bus],
    ]);
    flow([
      [x0 + 40, y0 + H + 34],
      [x0 + 40, bus + 1],
    ]);
    for (const x of [gr, gz, gc])
      flow([
        [x, bus],
        [x, gy + gh / 2],
      ]);
    flow([
      [gr, gt],
      [gr, mR[1] + 10],
    ]);
    flow([
      [x0 + 30, lineTop],
      [x0 + 30, mR[1]],
      [mR[0] - 10, mR[1]],
    ]);
    flow([
      [mR[0] + 10, mR[1]],
      [gc - 34, mR[1]],
      [gc - 34, gy],
      [gc - gw / 2, gy],
    ]);
    flow([
      [gz, gt],
      [gz, oneMinus[1] + 10],
    ]);
    flow([
      [oneMinus[0], oneMinus[1] - 10],
      [mA[0], lineTop + 10],
    ]);
    flow([
      [gz, y0 + 104],
      [gc + 26, y0 + 104],
      [gc + 26, mB[1]],
      [mB[0] - 10, mB[1]],
    ]);
    flow([
      [gc + gw / 2, gy],
      [mB[0], gy],
      [mB[0], mB[1] + 10],
    ]);
    flow([
      [mB[0], mB[1] - 10],
      [plus[0], lineTop + 10],
    ]);
    flow(
      [
        [x0 + W - 22, lineTop],
        [x0 + W - 22, y0 - 30],
      ],
      lw,
    );
    ops.push(
      [mA[0], mA[1], '×'],
      [plus[0], plus[1], '+'],
      [mB[0], mB[1], '×'],
      [oneMinus[0], oneMinus[1], '1−'],
      [mR[0], mR[1], '×'],
    );
    gates.push([gr, 'σ', 'r'], [gz, 'σ', 'z'], [gc, 'tanh', '\\tilde{h}']);
    math.push(
      ['h_{t-1}', x0 - 44, lineTop, 'end'],
      ['h_t', x0 + W + 44, lineTop, 'start'],
      ['x_t', x0 + 40, y0 + H + 46, 'middle'],
      ['h_t', x0 + W - 22, y0 - 40, 'middle'],
    );
  } else {
    const gc = x0 + 120;
    plain([
      [x0 - 40, bus],
      [gc, bus],
    ]);
    flow([
      [x0 + 40, y0 + H + 34],
      [x0 + 40, bus + 1],
    ]);
    flow([
      [gc, bus],
      [gc, gy + gh / 2],
    ]);
    flow(
      [
        [gc, gt],
        [gc, lineTop],
        [x0 + W + 40, lineTop],
      ],
      lw,
    );
    flow(
      [
        [x0 + W - 30, lineTop],
        [x0 + W - 30, y0 - 30],
      ],
      lw,
    );
    gates.push([gc, 'tanh', '']);
    math.push(
      ['h_{t-1}', x0 - 44, bus, 'end'],
      ['h_t', x0 + W + 44, lineTop, 'start'],
      ['x_t', x0 + 40, y0 + H + 46, 'middle'],
      ['h_t', x0 + W - 30, y0 - 40, 'middle'],
    );
  }

  painter.group('cell-parts', ['cell-parts']);
  ops.forEach(([x, y, s], k) => {
    painter.circle(
      `op-${k}`,
      x,
      y,
      10,
      { fill: theme.background ?? '#ffffff', stroke: ink, strokeWidth: 1.2 },
      {
        parent: 'cell-parts',
        classes: ['op'],
      },
    );
    const style = s.length > 1 ? { ...opStyle, size: 10 } : opStyle;
    painter.centered(`op-${k}-label`, painter.measure(s, style), x, y, style, {
      classes: ['label', 'label-op'],
    });
  });
  const gatePaint: Paint = {
    fill: theme.parts.gate.fill,
    stroke: theme.parts.gate.stroke,
    strokeWidth: 1.2,
  };
  gates.forEach(([x, s, name], k) => {
    painter.rect(`gate-${k}`, x - gw / 2, gy - gh / 2, gw, gh, gatePaint, {
      parent: 'cell-parts',
      classes: ['gate'],
      rx: 4,
    });
    painter.centered(`gate-${k}-label`, painter.measure(s, gateStyle), x, gy, gateStyle, {
      classes: ['label', 'label-gate'],
    });
    if (!name) return;
    // GRU wires come in from the left at gate height, so its gate names sit below right.
    if (type === 'gru') math.push([`${name}_t`, x + gw / 2 + 4, gy + gh / 2 + 9, 'start', small]);
    else math.push([`${name}_t`, x - gw / 2 - 4, gt - 6, 'end', small]);
  });

  painter.group('labels', ['labels']);
  math.forEach(([tex, x, y, anchor, style = mathStyle], k) => {
    const label = painter.measure(`$${tex}$`, style);
    painter.label(`math-${k}`, label, x, y + (label.ascent - label.descent) / 2, style, {
      anchor,
      classes: ['label', 'label-math'],
    });
  });
  const name = layer ? layerNameText(layer, CELL_WORD[type]) : 'RNN';
  if (theme.labels.names && name) {
    const label = painter.measure(`${name} cell`, theme.nameText);
    painter.label('name-0', label, x0 + W / 2, y0 + H + 72, theme.nameText, {
      classes: ['label', 'label-name'],
    });
  }
  const width = x0 + W + 110;
  const height = y0 + H + (theme.labels.names ? 82 : 58) + theme.margin;
  return painter.finish(width, height, {
    title: cleanLabel(model.title ?? '') || 'Neural network diagram',
    description:
      cleanLabel(model.description ?? '') ||
      `The gates inside one ${CELL_WORD[type]} cell: the previous state and the input go through the gates to the new state.`,
    family: 'rnn',
  });
}

/** Plain-language description used as the figure's accessible description (alt text). */
export function describeSequence(model: Model): string {
  const { shapes } = inferShapes(model);
  const auto = sequenceAutoNames(model.layers);
  const parts = model.layers.map(
    (layer, i) => `${layerNameText(layer, auto[i]!) || auto[i]} (${shapeText(shapes[i]!)})`,
  );
  const first = shapes[0];
  const steps = first?.kind === 'seq' ? first.steps : 1;
  return `Recurrent neural network over ${steps} time ${steps === 1 ? 'step' : 'steps'}: ${parts.join(', ')}.`;
}
