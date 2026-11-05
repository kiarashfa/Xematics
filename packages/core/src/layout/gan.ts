// Layout for generative adversarial networks: a noise column feeds the generator funnel, which
// widens to a Fake sample; Real samples come from the training data; both go into the
// discriminator funnel, which narrows to the score (real or fake). By default each funnel shows
// its network's neurons; the 'plain' funnel shows only its name. Each column of neurons is its
// own animation layer, so a signal runs from the noise to the score.
// Pure and deterministic: only + - * / and sqrt.

import { mixColor } from '../animate/random.ts';
import type { DenseLayer, GanLayer, Model } from '../model/schema.ts';
import type { Paint } from '../scene.ts';
import type { TextStyle, Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { Painter, type Point } from './draw.ts';
import type { Label } from './label.ts';
import { cleanLabel, slotsOf, type LayoutResult, type Slot } from './mlp.ts';

const NOISE_CELLS = 8;
const NOISE_CELL = 9;
const NOISE_WIDTH = 12;
/** Gray levels of the noise cells (fixed, so every export matches). */
const NOISE_LEVELS = [0.3, 0.62, 0.4, 0.78, 0.5, 0.34, 0.68, 0.46];
const BOX_H = 30;
const GAP = 34;
const SCORE_R = 14;

interface Funnel {
  readonly layers: readonly DenseLayer[];
  readonly slots: readonly (readonly Slot[])[];
  readonly width: number;
  /** Height at the left and right ends. */
  readonly left: number;
  readonly right: number;
  readonly name: Label | undefined;
}

export function layoutGan(model: Model, theme: Theme, engine: TextEngine): LayoutResult {
  const painter = new Painter(theme, engine, []);
  const gan = model.layers[0] as GanLayer;
  const neurons = theme.funnel === 'neurons';
  const r = Math.max(3, theme.maps.nodeRadius * 0.75);
  const pitch = 2 * r + 4;
  const arrow = theme.box.arrow;
  const partText = (fill: string): TextStyle => ({ ...theme.parts.text, color: fill });
  const nameStyle: TextStyle = { ...theme.nameText };

  const generator = gan.generator;
  const discriminator = gan.discriminator;
  const funnelOf = (layers: readonly DenseLayer[], word: string, widening: boolean): Funnel => {
    // Collapsed columns draw fewer neurons toward the narrow end, so the funnel keeps its shape.
    const most = theme.collapse.first + theme.collapse.last + 1;
    const slots = layers.map((layer, j) => {
      const full = slotsOf(layer, theme).slots;
      if (!full.includes('ellipsis')) return full;
      const along = layers.length === 1 ? 1 : j / (layers.length - 1);
      const t = widening ? along : 1 - along;
      const cap = Math.min(full.length, Math.max(3, 3 + Math.round((most - 3) * t)));
      const first = Math.floor((cap - 1) / 2);
      const last = cap - 1 - first;
      const units = layer.units;
      return [
        ...Array.from({ length: first }, (_, i) => i),
        'ellipsis' as const,
        ...Array.from({ length: last }, (_, i) => units - last + i),
      ];
    });
    const columnHeight = (s: readonly Slot[]) => (s.length - 1) * pitch + 2 * r;
    const name = theme.labels.names
      ? painter.measure(word, {
          ...nameStyle,
          color: (widening ? theme.parts.generator : theme.parts.discriminator).text,
        })
      : undefined;
    const width = neurons
      ? Math.max(150, 44 + (layers.length - 1) * 46)
      : Math.max(150, (name?.width ?? 0) + 44);
    let wide = neurons ? Math.max(110, ...slots.map((s) => columnHeight(s) + 20)) : 116;
    let narrow = neurons ? Math.max(46, wide * 0.42) : 52;
    if (neurons) {
      // Grow both ends until every column fits inside the slanted edges.
      const need = slots.map((s) => columnHeight(s) + 20);
      const xs = columnXs(layers.length, width);
      let scale = 1;
      need.forEach((h, j) => {
        const t = xs[j]! / width;
        const at = widening ? narrow + (wide - narrow) * t : wide + (narrow - wide) * t;
        scale = Math.max(scale, h / at);
      });
      narrow *= scale;
      wide *= scale;
    }
    return {
      layers,
      slots,
      width,
      left: widening ? narrow : wide,
      right: widening ? wide : narrow,
      name,
    };
  };
  const G = funnelOf(generator.slice(1), 'Generator', true);
  const D = funnelOf(discriminator.slice(0, -1), 'Discriminator', false);

  // Text.
  const realStyle = partText(theme.roles.input.text);
  const fakeStyle = partText(theme.parts.generator.text);
  const realWord = painter.measure('Real', realStyle);
  const fakeWord = painter.measure('Fake', fakeStyle);
  const boxW = Math.max(74, realWord.width + 28, fakeWord.width + 28);
  const dataStyle: TextStyle = { ...theme.nameText, weight: 400, size: theme.sizeText.size + 1 };
  const data = painter.measure('Training data', dataStyle);
  const markStyle = (color: string): TextStyle => ({ ...theme.parts.text, color });
  const realMark = painter.measure('Real', markStyle(theme.parts.real));
  const fakeMark = painter.measure('Fake', markStyle(theme.parts.fake));
  const scoreText = painter.measure('D', {
    ...theme.nodeText,
    size: 12,
    color: theme.roles.output.text,
  });
  const sizes = (layers: readonly DenseLayer[]) => layers.map((l) => l.units).join(' · ');
  const under = (name: string | undefined, size: string | undefined) => ({
    name: theme.labels.names && name ? painter.measure(name, theme.nameText) : undefined,
    size: theme.labels.sizes && size ? painter.measure(size, theme.sizeText) : undefined,
  });
  const noiseLabels = under('Noise', String(generator[0]!.units));
  const gLabels = under(neurons ? 'Generator' : undefined, sizes(G.layers));
  const dLabels = under(neurons ? 'Discriminator' : undefined, sizes(D.layers));
  const scoreLabels = under('Score', String(discriminator.at(-1)!.units));
  type Under = { name: Label | undefined; size: Label | undefined };
  const half = (l: Under) => Math.max(l.name?.width ?? 0, l.size?.width ?? 0) / 2;

  // Horizontal placement (forward coordinates).
  const noiseX = theme.margin + Math.max(0, half(noiseLabels) - NOISE_WIDTH / 2);
  const gx = noiseX + NOISE_WIDTH + GAP;
  const bx = gx + G.width + GAP;
  // The training data label sits left of the Real box, above the generator; keep it inside.
  const dataRoom = bx - 52 - 8 - data.width;
  const push = Math.max(0, theme.margin - dataRoom);
  const sx0 = push;
  const nx = noiseX + sx0;
  const gX = gx + sx0;
  const bX = bx + sx0;
  const dX = bX + boxW + GAP;
  const scoreX = dX + D.width + 26 + SCORE_R;
  const markX = scoreX + SCORE_R + 12;
  const width =
    Math.max(markX + Math.max(realMark.width, fakeMark.width) + 18, scoreX + half(scoreLabels)) +
    theme.margin;

  // Vertical placement: generator and Fake on one line, Real above, the discriminator between.
  const gTop = -G.right / 2;
  const realY = gTop - 12 - BOX_H / 2;
  const span = 0 - realY + BOX_H + 28;
  const dLeft = Math.max(D.left, span);
  const dRight = (D.right * dLeft) / D.left;
  const dY = realY / 2;
  const top = Math.min(realY - BOX_H / 2, dY - dLeft / 2, -G.right / 2);
  const bottom = Math.max(G.right / 2, dY + dLeft / 2, (NOISE_CELLS * NOISE_CELL) / 2);
  const oy = theme.margin - top;
  const gy = oy;
  const ry = realY + oy;
  const cy = dY + oy;
  const layersBottom = bottom + oy;

  const nameLine = engine.shape('', theme.nameText, theme.nameText.size);
  const sizeLine = engine.shape('', theme.sizeText, theme.sizeText.size);
  const anyName = [noiseLabels, gLabels, dLabels, scoreLabels].some((l) => l.name);
  const anySize = [noiseLabels, gLabels, dLabels, scoreLabels].some((l) => l.size);
  let cursor = layersBottom + theme.labelGap;
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
  const height = (anyName || anySize ? cursor : layersBottom) + theme.margin;

  // Layer numbering for the animation: noise, generator columns, samples, discriminator columns, score.
  const gLayers = neurons ? G.layers.length : 1;
  const dLayers = neurons ? D.layers.length : 1;
  const sampleLayer = 1 + gLayers;
  const dFirst = sampleLayer + 1;
  const scoreLayer = dFirst + dLayers;

  const funnelPaint = (p: { fill: string; stroke: string }): Paint => ({
    fill: p.fill,
    stroke: p.stroke,
    strokeWidth: 1.3,
  });
  const gPoints: Point[] = [
    [gX, gy - G.left / 2],
    [gX + G.width, gy - G.right / 2],
    [gX + G.width, gy + G.right / 2],
    [gX, gy + G.left / 2],
  ];
  const dPoints: Point[] = [
    [dX, cy - dLeft / 2],
    [dX + D.width, cy - dRight / 2],
    [dX + D.width, cy + dRight / 2],
    [dX, cy + dLeft / 2],
  ];
  if (neurons) {
    painter.group('funnel-g', ['funnel']);
    painter.polygon('funnel-generator', gPoints, funnelPaint(theme.parts.generator), {
      parent: 'funnel-g',
      classes: ['funnel', 'funnel-generator'],
    });
    painter.group('funnel-d', ['funnel']);
    painter.polygon('funnel-discriminator', dPoints, funnelPaint(theme.parts.discriminator), {
      parent: 'funnel-d',
      classes: ['funnel', 'funnel-discriminator'],
    });
  }

  // Connectors.
  const link = (layer: number, k: number, points: Point[]) => {
    const group = `edges-${layer}`;
    painter.group(group, ['edges']);
    painter.arrow(`arrow-${layer}-${k}`, points, arrow.color, arrow.width, {
      parent: group,
      classes: ['arrow'],
    });
  };
  link(0, 0, [
    [nx + NOISE_WIDTH + 6, gy],
    [gX - 5, gy],
  ]);
  link(sampleLayer - 1, 0, [
    [gX + G.width + 5, gy],
    [bX - 5, gy],
  ]);
  link(sampleLayer, 0, [
    [bX + boxW + 5, gy],
    [dX - 5, gy],
  ]);
  link(sampleLayer, 1, [
    [bX + boxW + 5, ry],
    [dX - 5, ry],
  ]);
  link(sampleLayer, 2, [
    [bX - 60, ry],
    [bX - 5, ry],
  ]);
  link(scoreLayer - 1, 0, [
    [dX + D.width + 5, cy],
    [scoreX - SCORE_R - 4, cy],
  ]);

  // Neurons inside the funnels, with their connections.
  const columns = (f: Funnel, x0: number, y: number, firstLayer: number) => {
    const xs = columnXs(f.layers.length, f.width).map((x) => x0 + x);
    const ys = (s: readonly Slot[]) => s.map((_, j) => y + (j - (s.length - 1) / 2) * pitch);
    const edgePaint: Paint = { stroke: theme.edge.color, strokeWidth: theme.edge.width * 0.8 };
    for (let c = 1; c < f.layers.length; c++) {
      const group = `edges-${firstLayer + c - 1}`;
      painter.group(group, ['edges']);
      const a = f.slots[c - 1]!;
      const b = f.slots[c]!;
      const ya = ys(a);
      const yb = ys(b);
      a.forEach((sa, i) => {
        if (sa === 'ellipsis') return;
        b.forEach((sb, j) => {
          if (sb === 'ellipsis') return;
          const dx = xs[c]! - xs[c - 1]!;
          const dy = yb[j]! - ya[i]!;
          const length = Math.sqrt(dx * dx + dy * dy);
          painter.line(
            `edge-${firstLayer + c - 1}-${sa}-${firstLayer + c}-${sb}`,
            xs[c - 1]! + (dx / length) * r,
            ya[i]! + (dy / length) * r,
            xs[c]! - (dx / length) * r,
            yb[j]! - (dy / length) * r,
            edgePaint,
            { parent: group, classes: ['edge'] },
          );
        });
      });
    }
    const paint = theme.roles.hidden;
    f.slots.forEach((s, c) => {
      const group = `layer-${firstLayer + c}`;
      painter.group(group, ['layer', 'layer-hidden']);
      ys(s).forEach((yy, j) => {
        const slot = s[j]!;
        if (slot === 'ellipsis') {
          const id = `ellipsis-${firstLayer + c}`;
          painter.group(id, ['ellipsis'], group);
          [-1, 0, 1].forEach((o, dot) =>
            painter.circle(
              `${id}-${dot}`,
              xs[c]!,
              yy + o * 5,
              1.6,
              { fill: theme.ellipsis.color },
              { parent: id },
            ),
          );
          return;
        }
        painter.circle(
          `node-${firstLayer + c}-${slot}`,
          xs[c]!,
          yy,
          r,
          { fill: paint.fill, stroke: paint.stroke, strokeWidth: 1.1 },
          {
            parent: group,
            classes: ['node', 'node-hidden'],
          },
        );
      });
    });
  };

  // Noise.
  painter.group('layer-0', ['layer', 'layer-input']);
  const paper = theme.background ?? '#ffffff';
  for (let k = 0; k < NOISE_CELLS; k++) {
    painter.rect(
      `box-0-${k}`,
      nx,
      gy - (NOISE_CELLS * NOISE_CELL) / 2 + k * NOISE_CELL,
      NOISE_WIDTH,
      NOISE_CELL,
      {
        fill: mixColor(paper, theme.roles.hidden.stroke, NOISE_LEVELS[k]!),
        stroke: arrow.color,
        strokeWidth: 0.6,
      },
      { parent: 'layer-0', classes: ['box', 'noise'] },
    );
  }

  if (neurons) {
    columns(G, gX, gy, 1);
  } else {
    painter.group('layer-1', ['layer', 'layer-hidden']);
    painter.polygon('box-1-funnel', gPoints, funnelPaint(theme.parts.generator), {
      parent: 'layer-1',
      classes: ['box', 'funnel', 'funnel-generator'],
    });
  }

  // Samples.
  painter.group(`layer-${sampleLayer}`, ['layer', 'layer-hidden']);
  const realPaint: Paint = {
    fill: theme.roles.input.fill,
    stroke: theme.roles.input.stroke,
    strokeWidth: theme.nodeStrokeWidth,
  };
  const fakePaint: Paint = {
    fill: theme.parts.generator.fill,
    stroke: theme.parts.generator.stroke,
    strokeWidth: theme.nodeStrokeWidth,
  };
  painter.rect(`box-${sampleLayer}-real`, bX, ry - BOX_H / 2, boxW, BOX_H, realPaint, {
    parent: `layer-${sampleLayer}`,
    classes: ['box', 'sample-real'],
    rx: 6,
  });
  painter.rect(`box-${sampleLayer}-fake`, bX, gy - BOX_H / 2, boxW, BOX_H, fakePaint, {
    parent: `layer-${sampleLayer}`,
    classes: ['box', 'sample-fake'],
    rx: 6,
  });

  if (neurons) {
    columns(D, dX, cy, dFirst);
  } else {
    painter.group(`layer-${dFirst}`, ['layer', 'layer-hidden']);
    painter.polygon(`box-${dFirst}-funnel`, dPoints, funnelPaint(theme.parts.discriminator), {
      parent: `layer-${dFirst}`,
      classes: ['box', 'funnel', 'funnel-discriminator'],
    });
  }

  // Score.
  painter.group(`layer-${scoreLayer}`, ['layer', 'layer-output']);
  const out = theme.roles.output;
  painter.circle(
    `node-${scoreLayer}-0`,
    scoreX,
    cy,
    SCORE_R,
    { fill: out.fill, stroke: out.stroke, strokeWidth: theme.nodeStrokeWidth },
    {
      parent: `layer-${scoreLayer}`,
      classes: ['node', 'node-output'],
    },
  );
  // A check mark after Real and a cross after Fake, drawn as lines so no font needs the symbols.
  painter.group('marks', ['marks']);
  const line = (y: number) => y + (realMark.ascent - realMark.descent) / 2;
  const markRealY = cy - 9;
  const markFakeY = cy + 9;
  const checkX = markX + realMark.width + 6;
  const crossX = markX + fakeMark.width + 6;
  painter.path(
    'mark-real',
    `M${checkX} ${markRealY}L${checkX + 3.5} ${markRealY + 3.5}L${checkX + 10} ${markRealY - 4}`,
    {
      fill: 'none',
      stroke: theme.parts.real,
      strokeWidth: 1.8,
    },
    { parent: 'marks', classes: ['mark'] },
  );
  painter.path(
    'mark-fake',
    `M${crossX} ${markFakeY - 4}L${crossX + 8} ${markFakeY + 4}M${crossX + 8} ${markFakeY - 4}L${crossX} ${markFakeY + 4}`,
    {
      fill: 'none',
      stroke: theme.parts.fake,
      strokeWidth: 1.8,
    },
    { parent: 'marks', classes: ['mark'] },
  );

  // Labels.
  painter.group('labels', ['labels']);
  painter.centered('sample-real-label', realWord, bX + boxW / 2, ry, realStyle, {
    classes: ['label', 'label-box'],
  });
  painter.centered('sample-fake-label', fakeWord, bX + boxW / 2, gy, fakeStyle, {
    classes: ['label', 'label-box'],
  });
  painter.centered('data-label', data, bX - 60 - 8 - data.width / 2, ry, dataStyle, {
    classes: ['label', 'label-data'],
  });
  painter.centered(
    'score-label',
    scoreText,
    scoreX,
    cy,
    { ...theme.nodeText, size: 12, color: out.text },
    { classes: ['label', 'label-node'] },
  );
  painter.label('mark-real-label', realMark, markX, line(markRealY), markStyle(theme.parts.real), {
    anchor: 'start',
    classes: ['label', 'label-mark'],
  });
  painter.label('mark-fake-label', fakeMark, markX, line(markFakeY), markStyle(theme.parts.fake), {
    anchor: 'start',
    classes: ['label', 'label-mark'],
  });
  if (!neurons) {
    if (G.name)
      painter.centered(
        'funnel-generator-label',
        G.name,
        gX + G.width / 2,
        gy,
        { ...nameStyle, color: theme.parts.generator.text },
        { classes: ['label', 'label-name'] },
      );
    if (D.name)
      painter.centered(
        'funnel-discriminator-label',
        D.name,
        dX + D.width / 2,
        cy,
        { ...nameStyle, color: theme.parts.discriminator.text },
        { classes: ['label', 'label-name'] },
      );
  }
  const put = (key: string, labels: Under, x: number) => {
    if (labels.name)
      painter.label(`name-${key}`, labels.name, x, nameBaseline, theme.nameText, {
        classes: ['label', 'label-name'],
      });
    if (labels.size)
      painter.label(`size-${key}`, labels.size, x, sizeBaseline, theme.sizeText, {
        classes: ['label', 'label-size'],
      });
  };
  put('noise', noiseLabels, nx + NOISE_WIDTH / 2);
  put('generator', gLabels, gX + G.width / 2);
  put('discriminator', dLabels, dX + D.width / 2);
  put('score', scoreLabels, scoreX);

  const scene = painter.finish(width, height, {
    title: cleanLabel(model.title ?? '') || 'Neural network diagram',
    description: cleanLabel(model.description ?? '') || describeGan(gan),
    family: 'gan',
  });
  return { scene, diagnostics: painter.diagnostics };
}

/** Column centers inside a funnel of the given width. */
function columnXs(count: number, width: number): number[] {
  if (count <= 1) return [width / 2];
  return Array.from({ length: count }, (_, j) => 22 + (j * (width - 44)) / (count - 1));
}

export function describeGan(gan: GanLayer): string {
  const sizes = (layers: readonly DenseLayer[]) => layers.map((l) => l.units).join(', ');
  return `Generative adversarial network: a generator (${sizes(gan.generator)}) turns noise into fake samples; a discriminator (${sizes(gan.discriminator)}) scores real and fake samples.`;
}
