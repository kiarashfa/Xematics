// The weights style (style.weights): every connection drawn by a learned weight, its sign as the
// color and its strength as opacity and width. The still frame of the 'learning' animation; the
// weights are made up but always the same for the same diagram.

import type { Scene } from '../scene.ts';
import type { Theme } from '../style/theme.ts';
import { edgeWeight, weightPaint } from './random.ts';

export function applyWeights(scene: Scene, theme: Theme): Scene {
  const { positive, negative } = theme.motion;
  return {
    ...scene,
    items: scene.items.map((item) => {
      if (item.kind !== 'line' || !/^(edge|fan)-/.test(item.id)) return item;
      const { learned } = edgeWeight(item.id);
      const p = weightPaint(learned, positive, negative);
      return {
        ...item,
        classes: [...(item.classes ?? []), learned >= 0 ? 'weight-positive' : 'weight-negative'],
        paint: { stroke: p.stroke, strokeWidth: p.strokeWidth, opacity: p.opacity },
      };
    }),
  };
}
