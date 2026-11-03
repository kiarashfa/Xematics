// Pure, immutable edits on the canonical model. Editors call these, then write the result back
// to the source text with updateText (see ./text.ts).

import type { Layer, Model, StyleOptions } from '../model/schema.ts';
import type { ShorthandLayer } from '../parse/shorthand.ts';

/** A partial update; a key set to undefined removes it. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

/** Layer fields to change; units can change but never be removed. */
export type LayerPatch = Patch<Omit<Layer, 'type' | 'units'>> & { units?: number };

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
    layers: model.layers.map((layer, i) => (i === index ? clean({ ...layer, ...patch }) : layer)),
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
    const base: Layer = old ? { ...old, units: s.units } : { type: 'dense', units: s.units };
    const { activation: _drop, ...rest } = base;
    return s.activation === undefined ? rest : { ...rest, activation: s.activation };
  });
  return { ...model, layers };
}

/** Sizes and activations as shorthand, whether or not the whole model fits the shorthand. */
export function structureOf(model: Model): string {
  return model.layers
    .map((l) => (l.activation ? `${l.units}:${l.activation}` : String(l.units)))
    .join('-');
}
