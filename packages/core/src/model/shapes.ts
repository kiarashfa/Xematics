// Shape inference: what each layer outputs. Feature maps follow kernel, stride and padding;
// sequences keep their steps through recurrent, embedding and transformer layers. Only integer arithmetic (floor and ceil of exact quotients), so every
// engine gets the same numbers. Problems are warnings: the diagram still draws.

import { diagnostic, type Diagnostic } from '../diagnostics.ts';
import {
  isRecurrent,
  parseDrawnShape,
  skipOf,
  type ConvLayer,
  type DeconvLayer,
  type Layer,
  type Model,
  type PoolLayer,
  type UpLayer,
} from './schema.ts';

export type Shape =
  | { readonly kind: 'map'; readonly h: number; readonly w: number; readonly c: number }
  | { readonly kind: 'vector'; readonly n: number }
  /** `steps` vectors of `n` numbers; `tokens` marks token ids (one number per step). */
  | { readonly kind: 'seq'; readonly steps: number; readonly n: number; readonly tokens?: true };

export interface ShapeResult {
  readonly shapes: readonly Shape[];
  readonly diagnostics: readonly Diagnostic[];
}

/** [height, width] of a window or stride given as one number or a pair. */
export function pair(value: number | readonly [number, number]): [number, number] {
  return typeof value === 'number' ? [value, value] : [value[0], value[1]];
}

/** Output length along one axis. 'same' keeps ceil(n / stride); 'valid' fits the window inside. */
function along(n: number, window: number, stride: number, padding: 'same' | 'valid'): number {
  return padding === 'same' ? Math.ceil(n / stride) : Math.floor((n - window) / stride) + 1;
}

export function inferShapes(model: Pick<Model, 'layers'>): ShapeResult {
  const diagnostics: Diagnostic[] = [];
  const shapes: Shape[] = [];
  const warn = (index: number, code: string, message: string) =>
    diagnostics.push(diagnostic('warning', code, message, { path: ['layers', index] }));

  model.layers.forEach((layer, index) => {
    const previous = shapes[index - 1];
    shapes.push(joined(layer, shapeOf(layer, previous, index, warn), shapes, index, warn));
  });
  return { shapes, diagnostics };
}

function shapeOf(
  layer: Layer,
  previous: Shape | undefined,
  index: number,
  warn: (index: number, code: string, message: string) => void,
): Shape {
  switch (layer.type) {
    case 'dense':
      // Applied to every step of a sequence.
      return previous?.kind === 'seq'
        ? { kind: 'seq', steps: previous.steps, n: layer.units }
        : { kind: 'vector', n: layer.units };
    case 'sequence':
      return { kind: 'seq', steps: layer.steps, n: layer.features };
    case 'tokens':
      return { kind: 'seq', steps: layer.length, n: 1, tokens: true };
    case 'rnn':
    case 'lstm':
    case 'gru': {
      const steps = stepsBefore(layer.type, previous, index, warn);
      const n = layer.units * (layer.bidirectional ? 2 : 1);
      return layer.last ? { kind: 'vector', n } : { kind: 'seq', steps, n };
    }
    case 'embed':
      return { kind: 'seq', steps: stepsBefore('embed', previous, index, warn), n: layer.width };
    case 'encoder':
    case 'decoder': {
      const steps = stepsBefore(layer.type, previous, index, warn);
      if (previous?.kind === 'seq' && previous.tokens) {
        warn(
          index,
          'shape.needs-embed',
          `Layer ${index + 1} (${layer.type}) reads vectors, but layer ${index} is token ids. Put an embed(512) layer between them.`,
        );
      }
      return { kind: 'seq', steps, n: previous?.kind === 'seq' ? previous.n : 1 };
    }
    case 'gan': {
      const out = layer.discriminator.at(-1);
      return { kind: 'vector', n: out?.units ?? 1 };
    }
    case 'autoencoder': {
      const out = (layer.decoder ?? layer.encoder).at(-1);
      return {
        kind: 'vector',
        n: layer.decoder ? (out?.units ?? 1) : (layer.encoder[0]?.units ?? 1),
      };
    }
    case 'input':
      return { kind: 'map', h: layer.shape[0], w: layer.shape[1], c: layer.shape[2] ?? 1 };
    case 'flatten':
      if (previous?.kind === 'map')
        return { kind: 'vector', n: previous.h * previous.w * previous.c };
      if (previous?.kind === 'seq') return { kind: 'vector', n: previous.steps * previous.n };
      return previous ?? { kind: 'vector', n: 1 };
    case 'gap':
      if (previous?.kind === 'map') return { kind: 'vector', n: previous.c };
      if (previous?.kind === 'seq') return { kind: 'vector', n: previous.n };
      return previous ?? { kind: 'vector', n: 1 };
    case 'deconv':
    case 'up':
      return drawnAs(layer, grown(layer, mapBefore(layer, previous, index, warn)), index, warn);
    case 'reshape': {
      const [h, w, c = 1] = layer.shape;
      const before =
        previous === undefined
          ? undefined
          : previous.kind === 'map'
            ? previous.h * previous.w * previous.c
            : previous.kind === 'seq'
              ? previous.steps * previous.n
              : previous.n;
      if (before !== undefined && before !== h * w * c) {
        warn(
          index,
          'shape.reshape-size',
          `Layer ${index + 1} reshapes ${before} values into ${h}×${w}×${c}, which holds ${h * w * c}.`,
        );
      }
      return { kind: 'map', h, w, c };
    }
    case 'conv':
    case 'pool':
      return drawnAs(
        layer,
        windowed(layer, mapBefore(layer, previous, index, warn), index, warn),
        index,
        warn,
      );
  }
}

/** Transposed convolution and upsampling: the map grows by the stride or the size. */
function grown(layer: DeconvLayer | UpLayer, input: { h: number; w: number; c: number }): Shape {
  if (layer.type === 'up') {
    const [sh, sw] = pair(layer.size);
    return { kind: 'map', h: input.h * sh, w: input.w * sw, c: input.c };
  }
  const [kh, kw] = pair(layer.kernel);
  const [sh, sw] = pair(layer.stride ?? 1);
  const valid = layer.padding === 'valid';
  const h = valid ? (input.h - 1) * sh + kh : input.h * sh;
  const w = valid ? (input.w - 1) * sw + kw : input.w * sw;
  return { kind: 'map', h, w, c: layer.filters };
}

/**
 * A skip connection joins an earlier layer's output: 'add' needs the same shape (a warning when it
 * differs, the shape stays), 'concat' stacks the channels (maps of the same height and width) or
 * appends the values (vectors).
 */
function joined(
  layer: Layer,
  shape: Shape,
  shapes: readonly Shape[],
  index: number,
  warn: (index: number, code: string, message: string) => void,
): Shape {
  const skip = skipOf(layer);
  if (!skip || skip.from > index) return shape;
  const source = shapes[skip.from - 1]!;
  if (skip.op === 'add') {
    if (shapeText(source) !== shapeText(shape) || source.kind !== shape.kind) {
      warn(
        index,
        'shape.skip-mismatch',
        `Layer ${index + 1} adds layer ${skip.from}, but their shapes differ (${shapeText(shape)} and ${shapeText(source)}).`,
      );
    }
    return shape;
  }
  if (shape.kind === 'map' && source.kind === 'map') {
    if (shape.h !== source.h || shape.w !== source.w) {
      warn(
        index,
        'shape.skip-mismatch',
        `Layer ${index + 1} stacks layer ${skip.from} onto it, but their sizes differ (${shape.h}×${shape.w} and ${source.h}×${source.w}).`,
      );
    }
    return { ...shape, c: shape.c + source.c };
  }
  if (shape.kind === 'vector' && source.kind === 'vector')
    return { kind: 'vector', n: shape.n + source.n };
  warn(
    index,
    'shape.skip-mismatch',
    `Layer ${index + 1} stacks layer ${skip.from} onto it, but one is a feature map and the other is not.`,
  );
  return shape;
}

/** A map layer with a shape override is drawn (and read by the next layer) at that size. */
function drawnAs(
  layer: ConvLayer | PoolLayer | DeconvLayer | UpLayer,
  computed: Shape,
  index: number,
  warn: (index: number, code: string, message: string) => void,
): Shape {
  const drawn = layer.shape === undefined ? undefined : parseDrawnShape(layer.shape);
  if (!drawn || computed.kind !== 'map') return computed;
  const shape: Shape = { kind: 'map', h: drawn.h, w: drawn.w, c: drawn.c ?? computed.c };
  if (shape.h !== computed.h || shape.w !== computed.w || shape.c !== computed.c) {
    warn(
      index,
      'shape.override',
      `Layer ${index + 1} is drawn as ${shapeText(shape)}; from its settings it would be ${shapeText(computed)}.`,
    );
  }
  return shape;
}

/** Steps of the sequence a layer reads; a flat vector counts as one step (with a warning). */
function stepsBefore(
  type: string,
  previous: Shape | undefined,
  index: number,
  warn: (index: number, code: string, message: string) => void,
): number {
  if (previous === undefined) return 1;
  if (previous.kind === 'seq') return previous.steps;
  warn(
    index,
    'shape.seq-after-vector',
    `Layer ${index + 1} (${type}) reads a sequence, but layer ${index} is not one. It is drawn as one step.`,
  );
  return 1;
}

function mapBefore(
  layer: ConvLayer | PoolLayer | DeconvLayer | UpLayer,
  previous: Shape | undefined,
  index: number,
  warn: (index: number, code: string, message: string) => void,
): { h: number; w: number; c: number } {
  if (previous === undefined) return { h: 1, w: 1, c: 1 };
  if (previous.kind === 'map') return previous;
  if (previous.kind === 'seq') {
    warn(
      index,
      'shape.map-after-vector',
      `Layer ${index + 1} (${layer.type}) needs an image or feature map, but layer ${index} is a sequence. It is drawn as a 1×1 map.`,
    );
    return { h: 1, w: 1, c: previous.n };
  }
  warn(
    index,
    'shape.map-after-vector',
    `Layer ${index + 1} (${layer.type}) needs an image or feature map, but layer ${index} is a flat vector. It is drawn as a 1×1 map.`,
  );
  return { h: 1, w: 1, c: previous.n };
}

function windowed(
  layer: ConvLayer | PoolLayer,
  input: { h: number; w: number; c: number },
  index: number,
  warn: (index: number, code: string, message: string) => void,
): Shape {
  const [kh, kw] = pair(layer.type === 'conv' ? layer.kernel : layer.size);
  const [sh, sw] = pair(layer.stride ?? (layer.type === 'conv' ? 1 : [kh, kw]));
  const padding = layer.padding ?? (layer.type === 'conv' ? 'same' : 'valid');
  let h = along(input.h, kh, sh, padding);
  let w = along(input.w, kw, sw, padding);
  if (h < 1 || w < 1) {
    warn(
      index,
      'shape.too-small',
      `Layer ${index + 1}: a ${kh}×${kw} window does not fit in the ${input.h}×${input.w} input. Use padding: same or a smaller window.`,
    );
    h = Math.max(1, h);
    w = Math.max(1, w);
  }
  return { kind: 'map', h, w, c: layer.type === 'conv' ? layer.filters : input.c };
}

const FIRST = new Set(['dense', 'input', 'sequence', 'tokens', 'gan', 'autoencoder']);
const ONLY_FIRST = new Set(['input', 'sequence', 'tokens']);
const IMAGE = new Set(['input', 'conv', 'pool', 'deconv', 'up', 'reshape']);
const SEQUENCE = new Set([
  'sequence',
  'tokens',
  'embed',
  'encoder',
  'decoder',
  'rnn',
  'lstm',
  'gru',
]);

/** Errors for layer orders that cannot be drawn: inputs come first and only there, families do not mix. */
export function orderDiagnostics(model: Pick<Model, 'layers'>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const error = (index: number, code: string, message: string) =>
    out.push(diagnostic('error', code, message, { path: ['layers', index] }));
  const layers = model.layers;
  const first = layers[0];
  const firstSequence = first?.type === 'sequence' || first?.type === 'tokens';
  if (first && !FIRST.has(first.type)) {
    const needs = SEQUENCE.has(first.type)
      ? 'a sequence before it. Start with seq(20x32) or tokens(512)'
      : 'an image before it. Start with an input like in(28x28x1)';
    error(0, 'model.needs-input', `Layer 1 is a ${first.type} layer, which needs ${needs}.`);
  }
  layers.forEach((layer, index) => {
    if (index > 0 && ONLY_FIRST.has(layer.type)) {
      const what = layer.type === 'input' ? 'an image input' : `a ${layer.type} input`;
      error(
        index,
        'model.input-not-first',
        `Layer ${index + 1} is ${what}. Only the first layer can be an input.`,
      );
    }
    if (layer.type === 'gan' && layers.length > 1) {
      error(
        index,
        'model.gan-alone',
        `A gan layer holds the whole diagram: write the generator and discriminator inside it, like gan(100-256-784 | 784-256-1).`,
      );
    }
    if (layer.type === 'autoencoder' && layers.length > 1) {
      error(
        index,
        'model.autoencoder-alone',
        `An autoencoder layer holds the whole diagram: write its layers inside it, like ae(784-256-32).`,
      );
    }
    if (
      index > 0 &&
      SEQUENCE.has(layer.type) &&
      !ONLY_FIRST.has(layer.type) &&
      !firstSequence &&
      FIRST.has(first?.type ?? '')
    ) {
      error(
        index,
        'model.needs-sequence',
        `Layer ${index + 1} is a ${layer.type} layer, which reads a sequence. Start with seq(20x32) or tokens(512).`,
      );
    }
  });
  const types = layers.map((l) => l.type);
  const image = types.findIndex((t) => IMAGE.has(t));
  const sequence = types.findIndex((t) => SEQUENCE.has(t));
  if (image >= 0 && sequence >= 0) {
    const at = Math.max(image, sequence);
    error(
      at,
      'model.mixed-family',
      `Layer ${at + 1} mixes image layers (in, conv, pool) with sequence layers. One diagram draws one kind of network.`,
    );
  }
  const block = types.findIndex((t) => t === 'encoder' || t === 'decoder');
  const recurrent = layers.findIndex(isRecurrent);
  if (block >= 0 && recurrent >= 0) {
    const at = Math.max(block, recurrent);
    error(
      at,
      'model.mixed-family',
      `Layer ${at + 1} mixes recurrent layers with transformer blocks. One diagram draws one kind of network.`,
    );
  }
  layers.forEach((layer, index) => {
    const skip = skipOf(layer);
    if (skip && skip.from > index) {
      error(
        index,
        'model.skip-from',
        index === 0
          ? 'Layer 1 has a skip connection, but no layer comes before it.'
          : `Layer ${index + 1} takes a skip from layer ${skip.from}, which does not come before it. Use a layer from 1 to ${index}.`,
      );
    }
  });
  const decoder = types.indexOf('decoder');
  const lateEncoder = types.lastIndexOf('encoder');
  if (decoder >= 0 && lateEncoder > decoder) {
    error(
      lateEncoder,
      'model.encoder-after-decoder',
      `Layer ${lateEncoder + 1} is an encoder after a decoder. Put encoder blocks before decoder blocks.`,
    );
  }
  return out;
}

/** A shape as people write it: 28×28×8 for maps, 784 for vectors, 20×64 for sequences, 512 for tokens. */
export function shapeText(shape: Shape): string {
  if (shape.kind === 'map') return `${shape.h}×${shape.w}×${shape.c}`;
  if (shape.kind === 'seq') return shape.tokens ? String(shape.steps) : `${shape.steps}×${shape.n}`;
  return String(shape.n);
}
