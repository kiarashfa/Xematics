// Shape inference for convolutional models: what each layer outputs, from its input, kernel,
// stride and padding. Only integer arithmetic (floor and ceil of exact quotients), so every
// engine gets the same numbers. Problems are warnings: the diagram still draws.

import { diagnostic, type Diagnostic } from '../diagnostics.ts';
import type { ConvLayer, Layer, Model, PoolLayer } from './schema.ts';

export type Shape =
  | { readonly kind: 'map'; readonly h: number; readonly w: number; readonly c: number }
  | { readonly kind: 'vector'; readonly n: number };

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
    shapes.push(shapeOf(layer, previous, index, warn));
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
      return { kind: 'vector', n: layer.units };
    case 'input':
      return { kind: 'map', h: layer.shape[0], w: layer.shape[1], c: layer.shape[2] ?? 1 };
    case 'flatten':
      return previous?.kind === 'map'
        ? { kind: 'vector', n: previous.h * previous.w * previous.c }
        : (previous ?? { kind: 'vector', n: 1 });
    case 'gap':
      return previous?.kind === 'map'
        ? { kind: 'vector', n: previous.c }
        : (previous ?? { kind: 'vector', n: 1 });
    case 'conv':
    case 'pool':
      return windowed(layer, mapBefore(layer, previous, index, warn), index, warn);
  }
}

function mapBefore(
  layer: ConvLayer | PoolLayer,
  previous: Shape | undefined,
  index: number,
  warn: (index: number, code: string, message: string) => void,
): { h: number; w: number; c: number } {
  if (previous === undefined) return { h: 1, w: 1, c: 1 };
  if (previous.kind === 'map') return previous;
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

/** Errors for layer orders that cannot be drawn: an image layer must come first, and only there. */
export function orderDiagnostics(model: Pick<Model, 'layers'>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const first = model.layers[0];
  if (first && first.type !== 'dense' && first.type !== 'input') {
    out.push(
      diagnostic(
        'error',
        'model.needs-input',
        `Layer 1 is a ${first.type} layer, which needs an image before it. Start with an input like in(28x28x1).`,
        { path: ['layers', 0] },
      ),
    );
  }
  model.layers.forEach((layer, index) => {
    if (index > 0 && layer.type === 'input') {
      out.push(
        diagnostic(
          'error',
          'model.input-not-first',
          `Layer ${index + 1} is an image input. Only the first layer can be an input.`,
          { path: ['layers', index] },
        ),
      );
    }
  });
  return out;
}

/** A shape as people write it: 28×28×8 for maps, 784 for vectors. */
export function shapeText(shape: Shape): string {
  return shape.kind === 'map' ? `${shape.h}×${shape.w}×${shape.c}` : String(shape.n);
}
