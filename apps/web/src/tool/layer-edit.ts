// Edits of the selected layer, shared by the ribbon's Layer tab and the phone's details sheet.
// A value that is not accepted leaves the source alone and sets tool.layerError: the field with
// that key shows it, and so does the status bar.

import {
  changeLayerType,
  layerToken,
  LIMITS,
  pair,
  parseDrawnShape,
  parseShorthand,
  patchLayer,
  type DenseLayer,
  type Layer,
  type LayerPatch,
  type LayerType,
} from '@xematics/core';
import { tool } from './state.svelte.ts';

type Window = number | [number, number];

export const ACTIVATIONS = [
  'relu',
  'gelu',
  'tanh',
  'sigmoid',
  'softmax',
  'linear',
  'leaky_relu',
  'elu',
  'swish',
];

export const TYPES: [LayerType, string][] = [
  ['dense', 'Dense (fully connected)'],
  ['input', 'Image input'],
  ['conv', 'Convolution'],
  ['pool', 'Pooling'],
  ['deconv', 'Transposed convolution'],
  ['up', 'Upsampling'],
  ['reshape', 'Reshape (vector to map)'],
  ['gap', 'Global average pooling'],
  ['flatten', 'Flatten'],
  ['sequence', 'Sequence input'],
  ['rnn', 'Recurrent (RNN)'],
  ['lstm', 'LSTM'],
  ['gru', 'GRU'],
  ['tokens', 'Tokens (text input)'],
  ['embed', 'Embedding'],
  ['encoder', 'Transformer encoder'],
  ['decoder', 'Transformer decoder'],
  ['gan', 'GAN (generator and discriminator)'],
  ['autoencoder', 'Autoencoder'],
];

const index = () => (tool.selection.kind === 'layer' ? tool.selection.index : -1);
const selected = (): Layer | undefined => tool.model?.layers[index()];
const value = (event: Event) => (event.currentTarget as HTMLInputElement).value;

function fail(key: string, message: string): undefined {
  tool.layerError = { key, message };
  return undefined;
}

function ok() {
  if (tool.layerError.key) tool.layerError = { key: '', message: '' };
}

function patch(change: LayerPatch, typing = false) {
  const i = index();
  if (i >= 0) tool.edit((m) => patchLayer(m, i, change), typing);
}

/** Reads a whole number from a field, or reports why it is not accepted. */
function whole(raw: string, min: number, max: number, what: string, key: string) {
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(n) || n < min || n > max)
    return fail(key, `${what} must be a whole number from ${min} to ${max}.`);
  ok();
  return n;
}

/** A whole-number field of the selected layer; `optional` fields clear when emptied. */
export function setNumber(
  key: string,
  min: number,
  max: number,
  what: string,
  event: Event,
  optional = false,
) {
  const raw = value(event).trim();
  if (optional && raw === '') {
    ok();
    patch({ [key]: undefined } as LayerPatch);
    return;
  }
  const n = whole(raw, min, max, what, key);
  if (n !== undefined) patch({ [key]: n } as LayerPatch);
}

export function setFlag(key: 'bidirectional' | 'last' | 'vae', on: boolean) {
  patch({ [key]: on || undefined } as LayerPatch);
}

/** A network inside a GAN or autoencoder, written like the shorthand: 100-256-784:tanh. */
export const networkText = (layers: readonly Layer[] | undefined) =>
  layers ? layers.map(layerToken).join('-') : '';

export function setNetwork(
  key: 'generator' | 'discriminator' | 'encoder' | 'decoder',
  text: string,
) {
  const trimmed = text.trim();
  if (key === 'decoder' && trimmed === '') {
    ok();
    patch({ decoder: undefined });
    return;
  }
  const parsed = parseShorthand(trimmed);
  const dense = parsed.layers.filter((l): l is DenseLayer => l.type === 'dense');
  if (parsed.diagnostics.length > 0 || dense.length !== parsed.layers.length || dense.length < 2) {
    fail(key, 'Write at least two layer sizes, like 784-256-32 (activations as 784:relu).');
    return;
  }
  ok();
  patch({ [key]: dense } as LayerPatch);
}

/** Kernel, pool window or stride: one number when square, [height, width] otherwise. */
export function setPair(
  key: 'kernel' | 'size' | 'stride',
  part: 0 | 1,
  event: Event,
  fallback: Window,
) {
  const layer = selected();
  const n = whole(value(event), 1, LIMITS.window, part === 0 ? 'Height' : 'Width', `${key}${part}`);
  if (n === undefined || !layer) return;
  const current = (layer as Record<string, unknown>)[key] as Window | undefined;
  const next = pair(current ?? fallback);
  next[part] = n;
  patch({ [key]: next[0] === next[1] ? next[0] : next } as LayerPatch);
}

export function setShape(part: 0 | 1 | 2, event: Event) {
  const layer = selected();
  if (layer?.type !== 'input' && layer?.type !== 'reshape') return;
  const max = part === 2 ? LIMITS.channels : LIMITS.side;
  const n = whole(value(event), 1, max, ['Height', 'Width', 'Channels'][part]!, `shape${part}`);
  if (n === undefined) return;
  const next: [number, number, number] = [layer.shape[0], layer.shape[1], layer.shape[2] ?? 1];
  next[part] = n;
  const shape: [number, number] | [number, number, number] =
    next[2] === 1 && layer.shape.length === 2 ? [next[0], next[1]] : next;
  patch({ shape });
}

export function setType(type: string) {
  ok();
  const i = index();
  if (i >= 0) tool.edit((m) => changeLayerType(m, i, type as LayerType));
}

export function setFilters(event: Event) {
  const filters = whole(value(event), 1, LIMITS.channels, 'Filters', 'filters');
  if (filters !== undefined) patch({ filters });
}

export function setUnits(event: Event) {
  const units = whole(value(event), 1, LIMITS.units, 'Neurons', 'units');
  if (units !== undefined) patch({ units });
}

export function setActivation(text: string) {
  const activation = text.trim();
  if (activation && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(activation)) {
    fail('activation', 'Activations are simple names like relu or softmax.');
    return;
  }
  ok();
  patch({ activation: activation || undefined });
}

export function setName(text: string) {
  patch({ name: text || undefined }, true);
}

export function setNodeLabel(text: string) {
  patch({ nodeLabel: text || undefined }, true);
}

/** The drawn size of a map layer ('26x26x8'); empty goes back to the computed size. */
export function setDrawnShape(text: string) {
  const raw = text.trim();
  if (raw === '') {
    ok();
    patch({ shape: undefined } as LayerPatch);
    return;
  }
  const shape = parseDrawnShape(raw);
  if (!shape) {
    fail('shape', 'Type a size like 26x26x8 or 26x26, or leave it empty.');
    return;
  }
  ok();
  patch({ shape: [shape.h, shape.w, ...(shape.c ? [shape.c] : [])].join('x') } as LayerPatch);
}

/** The skip connection of the selected layer: from an earlier layer (1-based), added or stacked. */
export function setSkip(from: number | undefined, op: 'add' | 'concat') {
  patch({
    skip: from === undefined ? undefined : { from, ...(op === 'concat' ? { op } : {}) },
  } as LayerPatch);
}

/** Layer types that can take a skip connection. */
export const SKIP_TYPES = new Set(['dense', 'conv', 'pool', 'deconv', 'up']);

export function setPadding(padding: 'same' | 'valid' | undefined) {
  patch({ padding });
}

export function setPoolMode(avg: boolean) {
  patch({ mode: avg ? 'avg' : undefined });
}

export function collapseModeOf(layer: Layer | undefined): 'default' | 'never' | 'custom' {
  if (layer?.type !== 'dense') return 'default';
  return layer.collapse === false ? 'never' : layer.collapse ? 'custom' : 'default';
}

export function setCollapseMode(mode: string) {
  patch({
    collapse:
      mode === 'never'
        ? false
        : mode === 'custom'
          ? { first: tool.collapse.first, last: tool.collapse.last }
          : undefined,
  });
}

export function setCollapseValue(key: 'first' | 'last' | 'above', event: Event) {
  const layer = selected();
  const max = key === 'above' ? LIMITS.units : LIMITS.collapseKeep;
  const n = whole(value(event), key === 'above' ? 1 : 0, max, label(key), `collapse-${key}`);
  if (n === undefined || layer?.type !== 'dense') return;
  const current = layer.collapse && typeof layer.collapse === 'object' ? layer.collapse : {};
  patch({ collapse: { ...current, [key]: n } });
}

const label = (key: 'first' | 'last' | 'above') =>
  key === 'first' ? 'Show first' : key === 'last' ? 'Show last' : 'Collapse above';
