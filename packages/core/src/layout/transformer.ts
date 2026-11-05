// Layout for Transformers, drawn as a pipeline from left to right like the other diagrams: token
// ids as a bar, the embedding with its positional encoding, each stack of blocks as a frame of
// slim boxes (attention, add and norm, feed forward) with residual paths, and the head (linear,
// activation, output). An encoder followed by a decoder gets two rows: the encoder on top, its
// output running down into the decoder's cross attention (the decoder's residual paths go below).
// Pure and deterministic: only + - * / and sqrt.

import type { Layer, Model } from '../model/schema.ts';
import { inferShapes, shapeText, type Shape } from '../model/shapes.ts';
import type { Paint } from '../scene.ts';
import type { RolePaint, TextStyle, Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { barHeight } from './boxes.ts';
import { Painter, type Point } from './draw.ts';
import type { Label } from './label.ts';
import { cleanLabel, labelReporter, roleOf, type LayoutResult } from './mlp.ts';
import { layerNameText, sequenceAutoNames } from './rnn.ts';

const BAR_W = 16;
const GAP = 22;
const PAD = 16;
const ATTN_W = 34;
const NORM_W = 20;
const EMBED_W = 30;
const PLUS_R = 10;
const WAVE_R = 11;
const RESIDUAL = 20;

interface Piece {
  readonly index: number;
  /** Suffix for ids of a layer drawn twice (the decoder row's copy of tokens and embedding). */
  readonly copy: string;
  readonly width: number;
  readonly up: number;
  readonly down: number;
  readonly name: Label | undefined;
  readonly size: Label | undefined;
  /** Where the name and size sit, from the piece's left edge. */
  readonly labelAt: number;
  /** The x (from the left edge) where the next arrow leaves, and where the previous one arrives. */
  readonly exit: number;
  readonly entry: number;
  draw(x: number, cy: number): void;
  /** Cross attention box center (from the left edge), for the encoder's output. */
  readonly cross?: number;
}

export function layoutTransformer(model: Model, theme: Theme, engine: TextEngine): LayoutResult {
  const painter = new Painter(theme, engine, []);
  const inferred = inferShapes(model);
  painter.diagnostics.push(...inferred.diagnostics);
  const shapes = inferred.shapes;
  const layers = model.layers;
  const count = layers.length;
  const auto = sequenceAutoNames(layers);
  const types = layers.map((l) => l.type);
  const lastEncoder = types.lastIndexOf('encoder');
  const firstDecoder = types.indexOf('decoder');
  const twoRows = lastEncoder >= 0 && firstDecoder > lastEncoder;

  const line = theme.parts.line;
  const arrow = theme.box.arrow;
  const slimText = (p: RolePaint): TextStyle => ({
    ...theme.parts.text,
    size: theme.parts.text.size - 1,
    color: p.text,
  });
  const words = [
    'Multi-head attention',
    'Masked attention',
    'Cross attention',
    'Feed forward',
    'Add & Norm',
    'Embedding',
  ];
  const longest = Math.max(
    ...words.map((w) => painter.measure(w, slimText(theme.parts.attention)).width),
  );
  const bh = Math.max(110, longest + 22);
  const headH = Math.max(84, painter.measure('Softmax', slimText(theme.roles.hidden)).width + 24);
  const paintOf = (p: { fill: string; stroke: string }, w = 1.2): Paint => ({
    fill: p.fill,
    stroke: p.stroke,
    strokeWidth: w,
  });
  const sizeOf = (shape: Shape) =>
    shape.kind === 'seq'
      ? shape.tokens
        ? shape.steps
        : shape.n
      : shape.kind === 'vector'
        ? shape.n
        : shape.c;
  const nameLabel = (i: number, text: string) =>
    theme.labels.names && text
      ? painter.measure(text, theme.nameText, labelReporter(i, 'name', painter.diagnostics))
      : undefined;
  const sizeLabel = (text: string) =>
    theme.labels.sizes && text ? painter.measure(text, theme.sizeText) : undefined;

  /** A slim box with its name turned to read bottom to top. */
  const slim = (
    id: string,
    group: string,
    x: number,
    cy: number,
    w: number,
    h: number,
    p: RolePaint,
    word: string,
  ) => {
    painter.rect(id, x, cy - h / 2, w, h, paintOf(p), {
      parent: group,
      classes: ['box', 'part'],
      rx: 3,
    });
    const style = slimText(p);
    painter.turned(`${id}-label`, painter.measure(word, style), x + w / 2, cy, style, {
      classes: ['label', 'label-part'],
    });
  };
  const flow = (id: string, group: string, points: Point[]) =>
    painter.arrow(id, points, line.color, line.width * 0.9, { parent: group, classes: ['flow'] });

  const pieces = (row: readonly number[], second: boolean): Piece[] =>
    row.map((index): Piece => {
      const layer = layers[index]!;
      const copy = second && index < firstDecoder && layer.type !== 'decoder' ? '-b' : '';
      const group = `layer-${index}${copy}`;
      const role = roleOf(index, count);
      const autoName =
        twoRows && (layer.type === 'tokens' || layer.type === 'sequence')
          ? second
            ? 'Outputs'
            : 'Inputs'
          : auto[index]!;
      const nameText = layerNameText(layer, autoName);
      const start = () => painter.group(group, ['layer', `layer-${role}`]);
      switch (layer.type) {
        case 'tokens':
        case 'sequence': {
          const h = barHeight(sizeOf(shapes[index]!), theme);
          const width = BAR_W;
          return {
            index,
            copy,
            width,
            up: h / 2,
            down: h / 2,
            name: nameLabel(index, nameText),
            size: sizeLabel(shapeText(shapes[index]!)),
            labelAt: width / 2,
            exit: width,
            entry: 0,
            draw(x, cy) {
              start();
              const p = theme.roles.input;
              painter.rect(
                `box-${index}${copy}`,
                x,
                cy - h / 2,
                width,
                h,
                paintOf(p, theme.nodeStrokeWidth),
                {
                  parent: group,
                  classes: ['box', 'box-input'],
                  rx: theme.box.radius / 2,
                },
              );
            },
          };
        }
        case 'embed': {
          const h = bh - 14;
          const width = EMBED_W + 18 + 2 * PLUS_R;
          return {
            index,
            copy,
            width,
            up: h / 2,
            down: Math.max(h / 2, PLUS_R + 40 + 2 * WAVE_R),
            name: undefined,
            size: sizeLabel(`d = ${layer.width}`),
            labelAt: EMBED_W / 2,
            exit: width,
            entry: 0,
            draw(x, cy) {
              start();
              slim(
                `box-${index}${copy}`,
                group,
                x,
                cy,
                EMBED_W,
                h,
                theme.roles.hidden,
                nameText || 'Embedding',
              );
              const px = x + EMBED_W + 18 + PLUS_R;
              flow(`flow-${index}${copy}-0`, group, [
                [x + EMBED_W, cy],
                [px - PLUS_R, cy],
              ]);
              plus(`plus-${index}${copy}`, group, px, cy);
              const wy = cy + PLUS_R + 40 + WAVE_R;
              flow(`flow-${index}${copy}-1`, group, [
                [px, wy - WAVE_R],
                [px, cy + PLUS_R],
              ]);
              wave(`wave-${index}${copy}`, group, px, wy);
            },
          };
        }
        case 'encoder':
        case 'decoder': {
          const masked = layer.type === 'decoder';
          const cross = masked && twoRows && index === firstDecoder;
          const below = cross; // residual paths go under the decoder in the two-row layout
          const subs: { word: string; paint: RolePaint; w: number; norm: boolean }[] = [
            {
              word: masked ? 'Masked attention' : 'Multi-head attention',
              paint: theme.parts.attention,
              w: ATTN_W,
              norm: false,
            },
            { word: 'Add & Norm', paint: theme.parts.norm, w: NORM_W, norm: true },
            ...(cross
              ? [
                  { word: 'Cross attention', paint: theme.parts.attention, w: ATTN_W, norm: false },
                  { word: 'Add & Norm', paint: theme.parts.norm, w: NORM_W, norm: true },
                ]
              : []),
            { word: 'Feed forward', paint: theme.parts.feedForward, w: ATTN_W, norm: false },
            { word: 'Add & Norm', paint: theme.parts.norm, w: NORM_W, norm: true },
          ];
          const lefts: number[] = [];
          let cursor = PAD;
          for (const sub of subs) {
            lefts.push(cursor);
            cursor += sub.w + GAP;
          }
          const width = cursor - GAP + PAD;
          const countLabel = painter.measure(`${layer.blocks} ×`, theme.nameText);
          const countLine = painter.engine.shape('', theme.nameText, theme.nameText.size);
          const frameTop = bh / 2 + 30;
          const frameBottom = bh / 2 + (below ? 30 : 12);
          const width0 = shapes[index - 1];
          const modelWidth = width0?.kind === 'seq' ? width0.n : 0;
          const ff = layer.ff ?? (modelWidth > 1 ? 4 * modelWidth : 0);
          const sizeText = `${layer.heads} ${layer.heads === 1 ? 'head' : 'heads'}${ff ? `, ff ${ff}` : ''}`;
          const crossIndex = subs.findIndex((s) => s.word === 'Cross attention');
          return {
            index,
            copy,
            width,
            up: frameTop + 6 + countLine.descent + countLine.ascent,
            down: frameBottom,
            name: nameLabel(
              index,
              nameText ? `${nameText} block${layer.blocks === 1 ? '' : 's'}` : '',
            ),
            size: sizeLabel(sizeText),
            labelAt: width / 2,
            exit: width,
            entry: 0,
            ...(crossIndex >= 0 ? { cross: lefts[crossIndex]! + ATTN_W / 2 } : {}),
            draw(x, cy) {
              start();
              const frame = theme.parts.frame;
              painter.rect(
                `frame-${index}`,
                x,
                cy - frameTop,
                width,
                frameTop + frameBottom,
                { fill: frame.fill, stroke: frame.stroke, strokeWidth: 1 },
                {
                  parent: group,
                  classes: ['frame'],
                  rx: 10,
                },
              );
              painter.label(
                `count-${index}`,
                countLabel,
                x + width,
                cy - frameTop - 6 - countLine.descent,
                theme.nameText,
                {
                  anchor: 'end',
                  classes: ['label', 'label-count'],
                },
              );
              const sign = below ? 1 : -1;
              const arcY = cy + sign * (bh / 2 + RESIDUAL);
              let k = 0;
              flow(`flow-${index}-${k++}`, group, [
                [x, cy],
                [x + lefts[0]!, cy],
              ]);
              subs.forEach((sub, j) => {
                const left = x + lefts[j]!;
                if (j + 1 < subs.length) {
                  flow(`flow-${index}-${k++}`, group, [
                    [left + sub.w, cy],
                    [x + lefts[j + 1]!, cy],
                  ]);
                }
                if (sub.norm) {
                  // Residual: from just before the sublayer around it into this Add & Norm.
                  const from = x + lefts[j - 1]! - GAP / 2;
                  const to = left + sub.w / 2;
                  painter.arrow(
                    `residual-${index}-${j}`,
                    [
                      [from, cy],
                      [from, arcY],
                      [to, arcY],
                      [to, cy + sign * (bh / 2)],
                    ],
                    line.color,
                    line.width * 0.9,
                    {
                      parent: group,
                      classes: ['residual'],
                    },
                  );
                }
              });
              subs.forEach((sub, j) =>
                slim(`box-${index}-${j}`, group, x + lefts[j]!, cy, sub.w, bh, sub.paint, sub.word),
              );
            },
          };
        }
        default: {
          // Dense (and pooling) layers: a linear box, the activation, and the output vector last.
          const last = index === count - 1;
          const act = 'activation' in layer && layer.activation ? capitalize(layer.activation) : '';
          const word =
            layer.type === 'flatten' ? 'Flatten' : layer.type === 'gap' ? 'Pool' : 'Linear';
          const outH = last ? barHeight(sizeOf(shapes[index]!), theme) : 0;
          const width = NORM_W + (act ? GAP + NORM_W : 0) + (last ? GAP + BAR_W : 0);
          const named = layer.name !== undefined || last;
          return {
            index,
            copy,
            width,
            up: Math.max(headH / 2, outH / 2),
            down: Math.max(headH / 2, outH / 2),
            name: named ? nameLabel(index, nameText) : undefined,
            size: sizeLabel(String(sizeOf(shapes[index]!))),
            labelAt: last ? width - BAR_W / 2 : NORM_W / 2,
            exit: width,
            entry: 0,
            draw(x, cy) {
              start();
              slim(`box-${index}-0`, group, x, cy, NORM_W, headH, theme.roles.hidden, word);
              let at = x + NORM_W;
              if (act) {
                flow(`flow-${index}-0`, group, [
                  [at, cy],
                  [at + GAP, cy],
                ]);
                slim(`box-${index}-1`, group, at + GAP, cy, NORM_W, headH, theme.roles.hidden, act);
                at += GAP + NORM_W;
              }
              if (last) {
                flow(`flow-${index}-1`, group, [
                  [at, cy],
                  [at + GAP, cy],
                ]);
                const p = theme.roles.output;
                painter.rect(
                  `box-${index}-out`,
                  at + GAP,
                  cy - outH / 2,
                  BAR_W,
                  outH,
                  paintOf(p, theme.nodeStrokeWidth),
                  {
                    parent: group,
                    classes: ['box', 'box-output'],
                    rx: theme.box.radius / 2,
                  },
                );
              }
            },
          };
        }
      }
    });

  const plus = (id: string, group: string, cx: number, cy: number) => {
    const paper = theme.background ?? '#ffffff';
    painter.circle(
      id,
      cx,
      cy,
      PLUS_R,
      { fill: paper, stroke: line.color, strokeWidth: 1.2 },
      { parent: group, classes: ['op'] },
    );
    painter.path(
      `${id}-sign`,
      `M${cx - 5} ${cy}L${cx + 5} ${cy}M${cx} ${cy - 5}L${cx} ${cy + 5}`,
      { fill: 'none', stroke: line.color, strokeWidth: 1.3 },
      { parent: group, classes: ['op'] },
    );
  };
  const wave = (id: string, group: string, cx: number, cy: number) => {
    const paper = theme.background ?? '#ffffff';
    painter.circle(
      id,
      cx,
      cy,
      WAVE_R,
      { fill: paper, stroke: line.color, strokeWidth: 1.2 },
      { parent: group, classes: ['op', 'positional'] },
    );
    painter.path(
      `${id}-sign`,
      `M${cx - 7} ${cy}C${cx - 4.7} ${cy - 7} ${cx - 2.3} ${cy - 7} ${cx} ${cy}C${cx + 2.3} ${cy + 7} ${cx + 4.7} ${cy + 7} ${cx + 7} ${cy}`,
      { fill: 'none', stroke: line.color, strokeWidth: 1.2 },
      { parent: group, classes: ['op', 'positional'] },
    );
  };

  // Rows of layer indices.
  const all = layers.map((_, i) => i);
  const rows: (readonly number[])[] = twoRows
    ? [
        all.slice(0, lastEncoder + 1),
        [
          ...all.slice(0, firstDecoder).filter((i) => types[i] !== 'encoder'),
          ...all.slice(firstDecoder),
        ],
      ]
    : [all];
  const rowPieces = rows.map((row, k) => pieces(row, k === 1));

  // Horizontal placement per row, keeping names and sizes apart.
  const labelHalf = (p: Piece) => Math.max(p.name?.width ?? 0, p.size?.width ?? 0) / 2;
  const place = (list: readonly Piece[]) => {
    const lefts: number[] = [];
    list.forEach((piece, i) => {
      const previous = list[i - 1];
      if (!previous) {
        lefts.push(theme.margin + Math.max(0, labelHalf(piece) - piece.labelAt));
        return;
      }
      const a = lefts[i - 1]! + previous.labelAt;
      const room = labelHalf(previous) + labelHalf(piece) + theme.labelPadding;
      const gap = Math.max(GAP + 8, room - (lefts[i - 1]! + previous.width - a) - piece.labelAt);
      lefts.push(lefts[i - 1]! + previous.width + gap);
    });
    return lefts;
  };
  const rowLefts = rowPieces.map(place);
  const width =
    Math.max(
      ...rowPieces.map((list, k) => {
        const last = list.at(-1)!;
        const left = rowLefts[k]!.at(-1)!;
        return (
          Math.max(left + last.width, left + last.labelAt + labelHalf(last)) +
          (k === 0 && twoRows ? 30 : 0)
        );
      }),
    ) + theme.margin;

  // Vertical placement.
  const nameLine = engine.shape('', theme.nameText, theme.nameText.size);
  const sizeLine = engine.shape('', theme.sizeText, theme.sizeText.size);
  let cursor = theme.margin;
  const centers: number[] = [];
  const baselines: { name: number; size: number }[] = [];
  rowPieces.forEach((list) => {
    const up = Math.max(...list.map((p) => p.up));
    const down = Math.max(...list.map((p) => p.down));
    const cy = cursor + up;
    centers.push(cy);
    let y = cy + down + theme.labelGap;
    let name = 0;
    let size = 0;
    if (list.some((p) => p.name)) {
      name = y + nameLine.ascent;
      y = name + nameLine.descent + theme.lineGap;
    }
    if (list.some((p) => p.size)) {
      size = y + sizeLine.ascent;
      y = size + sizeLine.descent;
    }
    baselines.push({ name, size });
    cursor = (list.some((p) => p.name || p.size) ? y : cy + down) + (twoRows ? 28 : 0);
  });
  const height = cursor - (twoRows ? 28 : 0) + theme.margin;

  // Connectors between layers, then the layers, then the encoder's output into cross attention.
  rowPieces.forEach((list, k) => {
    const lefts = rowLefts[k]!;
    const cy = centers[k]!;
    list.forEach((piece, i) => {
      const previous = list[i - 1];
      if (!previous) return;
      const group = `edges-${previous.index}${previous.copy}`;
      painter.group(group, ['edges']);
      painter.arrow(
        `arrow-${previous.index}${previous.copy}`,
        [
          [lefts[i - 1]! + previous.exit + 6, cy],
          [lefts[i]! + piece.entry - 6, cy],
        ],
        arrow.color,
        arrow.width,
        {
          parent: group,
          classes: ['arrow'],
        },
      );
    });
  });
  rowPieces.forEach((list, k) =>
    list.forEach((piece, i) => piece.draw(rowLefts[k]![i]!, centers[k]!)),
  );
  if (twoRows) {
    const top = rowPieces[0]!;
    const encoder = top.at(-1)!;
    const encoderRight = rowLefts[0]!.at(-1)! + encoder.width;
    const bottom = rowPieces[1]!;
    const d = bottom.findIndex((p) => p.cross !== undefined);
    if (d >= 0) {
      const target = rowLefts[1]![d]! + bottom[d]!.cross!;
      const y2 = centers[1]! - bh / 2 - 16;
      const group = `edges-${encoder.index}`;
      painter.group(group, ['edges']);
      painter.arrow(
        `memory-${encoder.index}`,
        [
          [encoderRight, centers[0]!],
          [encoderRight + 16, centers[0]!],
          [encoderRight + 16, y2],
          [target, y2],
          [target, centers[1]! - bh / 2],
        ],
        line.color,
        line.width,
        { parent: group, classes: ['memory'] },
      );
    }
  }

  painter.group('labels', ['labels']);
  rowPieces.forEach((list, k) => {
    list.forEach((piece, i) => {
      const x = rowLefts[k]![i]! + piece.labelAt;
      const key = `${piece.index}${piece.copy}`;
      if (piece.name)
        painter.label(`name-${key}`, piece.name, x, baselines[k]!.name, theme.nameText, {
          classes: ['label', 'label-name'],
        });
      if (piece.size)
        painter.label(`size-${key}`, piece.size, x, baselines[k]!.size, theme.sizeText, {
          classes: ['label', 'label-size'],
        });
    });
  });

  const scene = painter.finish(width, height, {
    title: cleanLabel(model.title ?? '') || 'Neural network diagram',
    description: cleanLabel(model.description ?? '') || describeTransformer(model),
    family: 'transformer',
  });
  return { scene, diagnostics: painter.diagnostics };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function describeTransformer(model: Model): string {
  const auto = sequenceAutoNames(model.layers);
  const { shapes } = inferShapes(model);
  const parts = model.layers.map((layer: Layer, i) => {
    const name = layerNameText(layer, auto[i]!) || auto[i]!;
    if (layer.type === 'encoder' || layer.type === 'decoder') {
      return `${name} (${layer.blocks} ${layer.blocks === 1 ? 'block' : 'blocks'}, ${layer.heads} ${layer.heads === 1 ? 'head' : 'heads'})`;
    }
    return `${name} (${shapeText(shapes[i]!)})`;
  });
  return `Transformer with ${parts.join(', ')}.`;
}
