// Gallery previews on the profile page. Loaded after the page shows, since it brings the engine.

import { parseModel, renderDiagram } from '@xematics/core';
import { loadEngine } from '../tool/engine.ts';
import { parseSafeSvg } from '../tool/safe-svg.ts';

/** A small preview of a document, mounted safely, or undefined when its source has errors. */
export async function thumbnail(text: string, prefix: string): Promise<SVGSVGElement | undefined> {
  const engine = await loadEngine();
  const { svg } = await renderDiagram(text, engine, { prefix });
  return svg ? parseSafeSvg(svg) : undefined;
}

/** Neurons in a document (0 when its source has errors). */
export function neurons(text: string): number {
  return parseModel(text).model?.layers.reduce((sum, layer) => sum + layer.units, 0) ?? 0;
}
