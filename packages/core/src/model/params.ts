// Trainable parameters (weights and biases) of each layer, counted from the shapes the layers read.
// Conventions follow the common frameworks: one bias per output, recurrent layers with one bias per
// gate, Transformer blocks with biased projections and two (decoders after an encoder: three)
// layer norms. Embeddings are left out: their size depends on the vocabulary, which the model does
// not state. Integer arithmetic only, so every engine gets the same numbers.

import { inferShapes, pair, type Shape } from './shapes.ts';
import type { DenseLayer, Layer, Model } from './schema.ts';

export interface LayerParams {
  readonly weights: number;
  readonly biases: number;
}

/** Inputs a layer reads per step: a vector's length, a sequence's width, a map's channels. */
function width(shape: Shape | undefined): number {
  if (!shape) return 0;
  if (shape.kind === 'map') return shape.c;
  return shape.n;
}

const dense = (inputs: number, units: number): LayerParams => ({
  weights: inputs * units,
  biases: units,
});

/** A chain of fully connected layers, like each network of a GAN or an autoencoder. */
function chain(layers: readonly DenseLayer[]): LayerParams {
  let weights = 0;
  let biases = 0;
  for (let i = 1; i < layers.length; i++) {
    const p = dense(layers[i - 1]!.units, layers[i]!.units);
    weights += p.weights;
    biases += p.biases;
  }
  return { weights, biases };
}

const add = (a: LayerParams, b: LayerParams): LayerParams => ({
  weights: a.weights + b.weights,
  biases: a.biases + b.biases,
});

const NONE: LayerParams = { weights: 0, biases: 0 };

function layerParams(
  layer: Layer,
  index: number,
  before: Shape | undefined,
  model: Pick<Model, 'layers'>,
): LayerParams | undefined {
  switch (layer.type) {
    case 'dense':
      // The first layer is the input: nothing to learn.
      return index === 0 ? undefined : dense(width(before), layer.units);
    case 'input':
    case 'sequence':
    case 'tokens':
      return undefined;
    case 'pool':
    case 'gap':
    case 'flatten':
      return NONE;
    case 'conv': {
      const [kh, kw] = pair(layer.kernel);
      return { weights: kh * kw * width(before) * layer.filters, biases: layer.filters };
    }
    case 'rnn':
    case 'lstm':
    case 'gru': {
      const gates = layer.type === 'lstm' ? 4 : layer.type === 'gru' ? 3 : 1;
      const directions = layer.bidirectional ? 2 : 1;
      const n = layer.units;
      return {
        weights: directions * gates * n * (width(before) + n),
        biases: directions * gates * n,
      };
    }
    case 'embed':
      return undefined;
    case 'encoder':
    case 'decoder': {
      const d = width(before);
      const ff = layer.ff ?? 4 * d;
      const cross =
        layer.type === 'decoder' && model.layers.slice(0, index).some((l) => l.type === 'encoder');
      const attention = { weights: 4 * d * d, biases: 4 * d };
      const norm = { weights: d, biases: d };
      let block = add(attention, add(dense(d, ff), dense(ff, d)));
      block = add(block, add(norm, norm));
      if (cross) block = add(block, add(attention, norm));
      return { weights: layer.blocks * block.weights, biases: layer.blocks * block.biases };
    }
    case 'gan':
      return add(chain(layer.generator), chain(layer.discriminator));
    case 'autoencoder': {
      const encoder = chain(layer.encoder);
      // A VAE's last encoder layer gives both the mean and the spread.
      const last = layer.encoder.at(-1)!;
      const extra =
        layer.vae && layer.encoder.length >= 2
          ? dense(layer.encoder.at(-2)!.units, last.units)
          : NONE;
      const decoder = chain(layer.decoder ?? [...layer.encoder].reverse());
      return add(add(encoder, extra), decoder);
    }
  }
}

/** Parameters of every layer; undefined for layers that hold data rather than learn (inputs). */
export function layerParamCounts(model: Pick<Model, 'layers'>): (LayerParams | undefined)[] {
  const { shapes } = inferShapes(model);
  return model.layers.map((layer, i) => layerParams(layer, i, shapes[i - 1], model));
}

/** All parameters of the model, and whether some layer (an embedding) could not be counted. */
export function totalParams(model: Pick<Model, 'layers'>): { count: number; partial: boolean } {
  let count = 0;
  let partial = false;
  const counts = layerParamCounts(model);
  model.layers.forEach((layer, i) => {
    const p = counts[i];
    if (p) count += p.weights + p.biases;
    else if (layer.type === 'embed') partial = true;
  });
  return { count, partial };
}

/** 100480 becomes 100,480. */
export function groupDigits(n: number): string {
  const s = String(Math.trunc(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
