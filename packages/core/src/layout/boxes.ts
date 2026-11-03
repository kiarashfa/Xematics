// Layer boxes layout: one rounded bar per layer, its height growing with the log of the neuron
// count, arrows between neighbouring bars, labels under each bar. Pure and deterministic: only
// + - * /, so every JavaScript engine produces the same numbers.

import type { Diagnostic } from '../diagnostics.ts';
import type { Model } from '../model/schema.ts';
import { SCENE_VERSION, type Paint, type SceneItem } from '../scene.ts';
import type { Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { cleanLabel, describe, layerName, roleOf, textItem, type LayoutResult } from './mlp.ts';

/** Space between a bar and the arrows next to it. */
const ARROW_GAP = 8;
/** Arrow head length and half its width. */
const HEAD_LENGTH = 8;
const HEAD_HALF = 4.5;
/** Shortest arrow shaft worth drawing; bars are spread apart to keep at least this much. */
const MIN_SHAFT = 16;

/**
 * log10 of a positive whole number. Math.log10 is not required to give identical results on every
 * engine, so this uses the digit count plus the binary-digit algorithm on the mantissa, which needs
 * only multiplication and division (exactly rounded everywhere). Accurate to about 1e-7.
 */
export function log10(n: number): number {
  let digits = 0;
  let m = n;
  while (m >= 10) {
    m /= 10;
    digits++;
  }
  let result = digits;
  let bit = 0.5;
  for (let i = 0; i < 24; i++) {
    m *= m;
    if (m >= 10) {
      m /= 10;
      result += bit;
    }
    bit /= 2;
  }
  return result;
}

export function barHeight(units: number, theme: Theme): number {
  return theme.box.minHeight + theme.box.perDecade * log10(units);
}

export function layoutBoxes(model: Model, theme: Theme, engine: TextEngine): LayoutResult {
  const diagnostics: Diagnostic[] = [];
  const count = model.layers.length;
  const w = theme.box.width;

  const bars = model.layers.map((layer, index) => {
    const name = layerName(layer, index, count, theme, engine, diagnostics);
    const size = theme.labels.sizes
      ? engine.shape(String(layer.units), theme.sizeText, theme.sizeText.size)
      : undefined;
    return {
      index,
      role: roleOf(index, count),
      height: barHeight(layer.units, theme),
      name,
      size,
      halfWidth: Math.max(w / 2, (name?.width ?? 0) / 2, (size?.width ?? 0) / 2),
    };
  });

  // Vertical metrics: bars are centered on one line, labels share baselines below the tallest bar.
  const nameLine = engine.shape('', theme.nameText, theme.nameText.size);
  const sizeLine = engine.shape('', theme.sizeText, theme.sizeText.size);
  const tallest = Math.max(...bars.map((b) => b.height));
  const centerY = theme.margin + tallest / 2;
  const barsBottom = theme.margin + tallest;
  const anyName = bars.some((b) => b.name);
  const anySize = bars.some((b) => b.size);
  let cursor = barsBottom + theme.labelGap;
  let nameBaseline = 0;
  let sizeBaseline = 0;
  if (anyName) {
    nameBaseline = cursor + nameLine.ascent;
    cursor = nameBaseline + nameLine.descent + theme.lineGap;
  }
  if (anySize) {
    sizeBaseline = cursor + sizeLine.ascent;
    cursor = sizeBaseline + sizeLine.descent;
  }
  const height = (anyName || anySize ? cursor : barsBottom) + theme.margin;

  // Horizontal positions: at least layerSpacing apart, wider for labels or a too short arrow.
  const minDistance = w + 2 * ARROW_GAP + HEAD_LENGTH + MIN_SHAFT;
  const xs: number[] = [];
  bars.forEach((bar, i) => {
    const previous = bars[i - 1];
    xs.push(
      previous === undefined
        ? theme.margin + bar.halfWidth
        : xs[i - 1]! +
            Math.max(
              theme.layerSpacing,
              minDistance,
              previous.halfWidth + bar.halfWidth + theme.labelPadding,
            ),
    );
  });
  const width = xs.at(-1)! + bars.at(-1)!.halfWidth + theme.margin;

  const items: SceneItem[] = [];

  const arrow = theme.box.arrow;
  for (let i = 0; i + 1 < count; i++) {
    const start = xs[i]! + w / 2 + ARROW_GAP;
    const tip = xs[i + 1]! - w / 2 - ARROW_GAP;
    const group = `edges-${i}`;
    items.push({ kind: 'group', id: group, classes: ['edges'] });
    items.push({
      kind: 'line',
      id: `arrow-${i}`,
      parent: group,
      classes: ['arrow'],
      x1: start,
      y1: centerY,
      // Stop inside the head so the line's butt end never shows past its point.
      x2: tip - HEAD_LENGTH + 1,
      y2: centerY,
      paint: { stroke: arrow.color, strokeWidth: arrow.width },
    });
    items.push({
      kind: 'path',
      id: `arrow-${i}-head`,
      parent: group,
      classes: ['arrow-head'],
      d: `M${tip} ${centerY}L${tip - HEAD_LENGTH} ${centerY - HEAD_HALF}L${tip - HEAD_LENGTH} ${centerY + HEAD_HALF}Z`,
      paint: { fill: arrow.color },
    });
  }

  for (const bar of bars) {
    const group = `layer-${bar.index}`;
    const role = theme.roles[bar.role];
    const paint: Paint = {
      fill: role.fill,
      stroke: role.stroke,
      strokeWidth: theme.nodeStrokeWidth,
    };
    items.push({ kind: 'group', id: group, classes: ['layer', `layer-${bar.role}`] });
    items.push({
      kind: 'rect',
      id: `box-${bar.index}`,
      parent: group,
      classes: ['box', `box-${bar.role}`],
      x: xs[bar.index]! - w / 2,
      y: centerY - bar.height / 2,
      width: w,
      height: bar.height,
      rx: theme.box.radius,
      paint,
    });
  }

  if (anyName || anySize) {
    items.push({ kind: 'group', id: 'labels', classes: ['labels'] });
    for (const bar of bars) {
      const x = xs[bar.index]!;
      if (bar.name) {
        items.push(
          textItem(
            `name-${bar.index}`,
            ['label', 'label-name'],
            bar.name,
            x,
            nameBaseline,
            theme.nameText,
            engine,
          ),
        );
      }
      if (bar.size) {
        items.push(
          textItem(
            `size-${bar.index}`,
            ['label', 'label-size'],
            bar.size,
            x,
            sizeBaseline,
            theme.sizeText,
            engine,
          ),
        );
      }
    }
  }

  return {
    scene: {
      version: SCENE_VERSION,
      width,
      height,
      background: theme.background,
      title: cleanLabel(model.title ?? '') || 'Neural network diagram',
      description: cleanLabel(model.description ?? '') || describe(model),
      items,
    },
    diagnostics,
  };
}
