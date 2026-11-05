// Pure, immutable edits on the canonical model. Editors call these, then write the result back
// to the source text with updateText (see ./text.ts).

import type { Layer, LayerType, Model, StyleOptions } from '../model/schema.ts';
import { layerToken, type ShorthandLayer } from '../parse/shorthand.ts';

/** A partial update; a key set to undefined removes it. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

type AllKeys<T> = T extends unknown ? keyof T : never;
type ValueOf<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;

/** Layer fields to change (any layer type's fields; the editor offers only the ones that apply). */
export type LayerPatch = {
  [K in Exclude<AllKeys<Layer>, 'type'>]?: ValueOf<Layer, K> | undefined;
};

type LabelsPatch = Patch<NonNullable<StyleOptions['labels']>>;
type CollapsePatch = Patch<NonNullable<StyleOptions['collapse']>>;
export type StylePatch = Patch<Omit<StyleOptions, 'labels' | 'collapse'>> & {
  labels?: LabelsPatch | undefined;
  collapse?: CollapsePatch | undefined;
};

function clean<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) if (v !== undefined) out[key] = v;
  return out as T;
}

const isEmpty = (value: object) => Object.keys(value).length === 0;

export function patchModel(
  model: Model,
  patch: Patch<Pick<Model, 'title' | 'description'>>,
): Model {
  return clean({ ...model, ...patch });
}

export function patchLayer(model: Model, index: number, patch: LayerPatch): Model {
  if (!model.layers[index]) return model;
  return {
    ...model,
    layers: model.layers.map((layer, i) =>
      i === index ? (clean({ ...layer, ...patch }) as Layer) : layer,
    ),
  };
}

/** A new layer of each type, with the usual starting values. */
export function defaultLayer(type: LayerType): Layer {
  switch (type) {
    case 'dense':
      return { type, units: 16 };
    case 'input':
      return { type, shape: [28, 28, 1] };
    case 'conv':
      return { type, filters: 16, kernel: 3 };
    case 'pool':
      return { type, size: 2 };
    case 'gap':
    case 'flatten':
      return { type };
  }
}

/** Changes a layer's type, keeping its name (and activation where the new type takes one). */
export function changeLayerType(model: Model, index: number, type: LayerType): Model {
  const old = model.layers[index];
  if (!old || old.type === type) return model;
  const next: Record<string, unknown> = { ...defaultLayer(type) };
  if (old.name !== undefined) next['name'] = old.name;
  if (
    (type === 'dense' || type === 'conv') &&
    'activation' in old &&
    old.activation !== undefined
  ) {
    next['activation'] = old.activation;
  }
  return {
    ...model,
    layers: model.layers.map((layer, i) => (i === index ? (next as Layer) : layer)),
  };
}

/** Inserts a layer at `index` (clamped). The new layer copies nothing from its neighbours. */
export function insertLayer(
  model: Model,
  index: number,
  layer: Layer = { type: 'dense', units: 4 },
): Model {
  const at = Math.max(0, Math.min(index, model.layers.length));
  return { ...model, layers: [...model.layers.slice(0, at), layer, ...model.layers.slice(at)] };
}

/** Removes a layer; the last remaining layer cannot be removed. */
export function removeLayer(model: Model, index: number): Model {
  if (model.layers.length <= 1 || !model.layers[index]) return model;
  return { ...model, layers: model.layers.filter((_, i) => i !== index) };
}

export function moveLayer(model: Model, index: number, delta: -1 | 1): Model {
  const target = index + delta;
  const layer = model.layers[index];
  const other = model.layers[target];
  if (!layer || !other) return model;
  const layers = [...model.layers];
  layers[index] = other;
  layers[target] = layer;
  return { ...model, layers };
}

export function patchStyle(model: Model, patch: StylePatch): Model {
  const current = model.style ?? {};
  const { labels, collapse, ...flat } = patch;
  const next: Record<string, unknown> = clean({ ...current, ...flat });
  if (labels !== undefined) next['labels'] = clean({ ...current.labels, ...labels });
  if (collapse !== undefined) next['collapse'] = clean({ ...current.collapse, ...collapse });
  for (const key of ['labels', 'collapse']) {
    const value = next[key];
    if (value && typeof value === 'object' && isEmpty(value)) delete next[key];
  }
  const { style: _old, ...rest } = model;
  return isEmpty(next) ? rest : { ...rest, style: next as StyleOptions };
}

/**
 * Applies new layer sizes and activations (for example from the shorthand bar) while keeping
 * every other per-layer setting. The first and last layers stay matched to the old first and
 * last (they usually carry the input and output names); layers in between match by position.
 */
export function applyStructure(model: Model, structure: readonly ShorthandLayer[]): Model {
  if (structure.length === 0) return model;
  const before = model.layers;
  const count = structure.length;
  const match = (i: number): Layer | undefined => {
    if (count === before.length || i === 0) return before[i];
    if (i === count - 1) return before.length > 1 ? before.at(-1) : undefined;
    return i < before.length - 1 ? before[i] : undefined;
  };
  const layers = structure.map((s, i): Layer => {
    const old = match(i);
    if (s.type === 'dense') {
      const base: Layer =
        old?.type === 'dense' ? { ...old, units: s.units } : { type: 'dense', units: s.units };
      const { activation: _drop, ...rest } = base;
      return s.activation === undefined ? rest : { ...rest, activation: s.activation };
    }
    // Other types come whole from the structure; a layer of the same type keeps its name.
    return old?.type === s.type && old.name !== undefined ? { ...s, name: old.name } : s;
  });
  return { ...model, layers };
}

/** Sizes and activations as shorthand, whether or not the whole model fits the shorthand. */
export function structureOf(model: Model): string {
  return model.layers.map(layerToken).join('-');
}

/** The number a layer's plus and minus buttons change: neurons of dense layers, filters of convolutions. */
export function layerCount(
  layer: Layer,
):
  { readonly key: 'units' | 'filters'; readonly value: number; readonly noun: string } | undefined {
  if (layer.type === 'dense') return { key: 'units', value: layer.units, noun: 'neurons' };
  if (layer.type === 'conv') return { key: 'filters', value: layer.filters, noun: 'filters' };
  return undefined;
}
