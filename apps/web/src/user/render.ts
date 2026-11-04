// Gallery previews and facts on the profile page. Loaded after the page shows, since it brings
// the engine.

import { parseModel, renderDiagram, type PresetId } from '@xematics/core';
import { loadEngine } from '../tool/engine.ts';
import { parseSafeSvg } from '../tool/safe-svg.ts';

const PRESET_NAMES: Record<PresetId, string> = {
  classic: 'Classic',
  boxes: 'Layer boxes',
  mono: 'Print mono',
  colorblind: 'Colorblind',
  'colorblind-dark': 'Colorblind dark',
};

/** Rendered previews by document id and edit time, so switching views does not redraw them. */
const cache = new Map<string, Promise<string | undefined>>();

/** A small preview of a document, mounted safely, or undefined when its source has errors. */
export async function preview(
  id: string,
  updatedAt: string,
  text: string,
): Promise<SVGSVGElement | undefined> {
  const key = `${id}@${updatedAt}`;
  let markup = cache.get(key);
  if (!markup) {
    markup = loadEngine().then(
      async (engine) => (await renderDiagram(text, engine, { prefix: `g-${id.slice(0, 8)}-` })).svg,
    );
    cache.set(key, markup);
  }
  const svg = await markup;
  return svg ? parseSafeSvg(svg) : undefined;
}

export interface DiagramFacts {
  layers: number;
  neurons: number;
  style: string;
}

/** Layers, neurons and style of a document (zeros when its source has errors). */
export function facts(text: string): DiagramFacts {
  const model = parseModel(text).model;
  return {
    layers: model?.layers.length ?? 0,
    neurons: model?.layers.reduce((sum, layer) => sum + layer.units, 0) ?? 0,
    style: PRESET_NAMES[model?.style?.preset ?? 'classic'],
  };
}
