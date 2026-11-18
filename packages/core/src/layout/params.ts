// Parameter counts under the layer labels (style.labels.params), added after the layout of fully
// connected, bar and convolutional diagrams: one small line under each layer's lowest label, and
// the figure grows to fit. The family layouts (recurrent, Transformer, GAN, autoencoder) label
// their parts differently and do not draw counts; the editor shows them for every network.

import type { Model } from '../model/schema.ts';
import { groupDigits, layerParamCounts } from '../model/params.ts';
import type { Scene, SceneItem } from '../scene.ts';
import type { TextStyle, Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { textItem } from './label.ts';

/** The text under a layer: '100,480 params', '1 param', '-' for layers with nothing to learn. */
export function paramsText(total: number): string {
  if (total === 0) return '-';
  return `${groupDigits(total)} ${total === 1 ? 'param' : 'params'}`;
}

export function paramsStyle(theme: Theme): TextStyle {
  return { ...theme.sizeText, size: theme.sizeText.size - 1 };
}

/** Every text the counts can draw, so fonts load before layout. */
export function paramsTexts(model: Model): string[] {
  return layerParamCounts(model).flatMap((p) => (p ? [paramsText(p.weights + p.biases)] : []));
}

/** Baseline position and line style of the lowest label of a layer, if it has one. */
function anchorOf(
  scene: Scene,
  index: number,
  theme: Theme,
): { x: number; y: number; style: TextStyle } | undefined {
  const byId = (id: string) => scene.items.find((item) => item.id === id);
  const candidates: { item: SceneItem; style: TextStyle }[] = [];
  const name = byId(`name-${index}`);
  if (name) candidates.push({ item: name, style: theme.nameText });
  const size = theme.labels.sizes ? byId(`size-${index}`) : undefined;
  if (size) candidates.push({ item: size, style: theme.sizeText });
  let best: { x: number; y: number; style: TextStyle } | undefined;
  for (const { item, style } of candidates) {
    const place = placeOf(scene, item);
    if (place && (!best || place.y > best.y)) best = { ...place, style };
  }
  return best;
}

/** Center x and baseline y of a label (a text item, or a group of text and formula runs). */
function placeOf(scene: Scene, item: SceneItem): { x: number; y: number } | undefined {
  if (item.kind === 'text') return { x: item.x, y: item.y };
  if (item.kind !== 'group') return undefined;
  const parts = scene.items.filter((i) => i.parent === item.id);
  let left = Infinity;
  let right = -Infinity;
  let y: number | undefined;
  for (const part of parts) {
    if (part.kind === 'text') {
      left = Math.min(left, part.x - part.width / 2);
      right = Math.max(right, part.x + part.width / 2);
      y ??= part.y;
    } else if (part.kind === 'math') {
      left = Math.min(left, part.x);
      right = Math.max(right, part.x + part.width);
      y ??= part.y;
    }
  }
  return y === undefined ? undefined : { x: (left + right) / 2, y };
}

export function applyParams(scene: Scene, model: Model, theme: Theme, engine: TextEngine): Scene {
  if (scene.family !== undefined) return scene;
  const style = paramsStyle(theme);
  const line = engine.shape('', style, style.size);
  const added: SceneItem[] = [];
  let bottom = 0;
  layerParamCounts(model).forEach((params, index) => {
    if (!params) return;
    const anchor = anchorOf(scene, index, theme);
    if (!anchor) return;
    const above = engine.shape('', anchor.style, anchor.style.size);
    const y = anchor.y + above.descent + theme.lineGap + line.ascent;
    const shaped = engine.shape(paramsText(params.weights + params.biases), style, style.size);
    added.push(
      textItem(`params-${index}`, ['label', 'label-params'], shaped, anchor.x, y, style, engine),
    );
    bottom = Math.max(bottom, y + line.descent);
  });
  if (added.length === 0) return scene;
  return {
    ...scene,
    height: Math.max(scene.height, bottom + theme.margin),
    items: [...scene.items, ...added],
  };
}
