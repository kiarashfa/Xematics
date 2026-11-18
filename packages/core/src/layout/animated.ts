// Items only the animation shows (animation.equations, animation.loss): a caption under the figure
// with the formula of the layer the forward pass is in, and a loss curve that draws itself during
// the training look. They live in scene.animation, so still exports (SVG, PNG, PDF, TikZ) are
// unchanged; animated SVG, GIF, video and the editor's player add them (animate/css.ts).
// Pure and deterministic: only + - * / and sqrt.

import { mixColor, seeded } from '../animate/random.ts';
import { skipOf, type Layer, type Model } from '../model/schema.ts';
import type { Scene, SceneItem } from '../scene.ts';
import type { TextStyle, Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { buildLabel, labelItems } from './label.ts';

/** Points of the loss curve, one per step of the loop. */
export const LOSS_POINTS = 41;
const LOSS_HEIGHT = 56;
const CAPTION_H = 28;

const act = (layer: Layer) =>
  'activation' in layer && layer.activation !== undefined && layer.activation !== 'linear'
    ? layer.activation
    : undefined;

/** The formula of each layer as TeX (undefined for the input), in the h1, h2... notation. */
export function layerFormulas(model: Model): (string | undefined)[] {
  const count = model.layers.length;
  const name = (i: number) => (i === 0 ? 'x' : i === count - 1 ? '\\hat{y}' : `h_{${i}}`);
  return model.layers.map((layer, i) => {
    if (i === 0) return undefined;
    const input = name(i - 1);
    const skip = skipOf(layer);
    const joined = (inner: string) =>
      !skip
        ? inner
        : skip.op === 'add'
          ? `${inner} + ${name(skip.from - 1)}`
          : `[\\,${inner},\\ ${name(skip.from - 1)}\\,]`;
    const wrap = (inner: string) => {
      const a = act(layer);
      return a ? `\\mathrm{${a.replace(/_/g, '\\_')}}(${inner})` : inner;
    };
    let body: string;
    switch (layer.type) {
      case 'dense':
        body = wrap(`W_{${i}}${input} + b_{${i}}`);
        break;
      case 'conv':
        body = wrap(`W_{${i}} \\ast ${input} + b_{${i}}`);
        break;
      case 'deconv':
        body = wrap(`W_{${i}}^{\\top} \\ast ${input} + b_{${i}}`);
        break;
      case 'pool':
        body = `\\mathrm{${layer.mode === 'avg' ? 'avgpool' : 'maxpool'}}(${input})`;
        break;
      case 'up':
        body = `\\mathrm{upsample}(${input})`;
        break;
      case 'reshape':
        body = `\\mathrm{reshape}(${input})`;
        break;
      case 'flatten':
        body = `\\mathrm{flatten}(${input})`;
        break;
      case 'gap':
        body = `\\mathrm{mean}(${input})`;
        break;
      default:
        return undefined;
    }
    return `${name(i)} = ${joined(body)}`;
  });
}

/** Losses over the training loop: falling fast, then slowly, with a little noise. */
export function lossValues(): number[] {
  const next = seeded(20261118);
  return Array.from({ length: LOSS_POINTS }, (_, i) => {
    const wobble = (next() - 0.5) * 0.08 * (1 - i / LOSS_POINTS);
    return Math.round((0.12 + 2.1 / (1 + 0.32 * i) + wobble) * 1000) / 1000;
  });
}

/** Adds the animation-only items to a laid-out scene when the model asks for them. */
export function applyAnimationItems(
  scene: Scene,
  model: Model,
  theme: Theme,
  engine: TextEngine,
): Scene {
  const options = model.animation;
  const look = options?.look ?? 'pulse';
  const equations = options?.equations === true && look !== 'learning' && !scene.family;
  const loss = options?.loss === true && look === 'training';
  if (!equations && !loss) return scene;
  const items: SceneItem[] = [];
  const forward = options?.forward ?? theme.motion.forward;
  const backward = options?.backward ?? theme.motion.backward;
  const paper = theme.background ?? '#ffffff';
  let y = scene.height;

  if (equations) {
    // One caption per layer, all in the same place; the timeline shows each in turn.
    const style: TextStyle = { ...theme.nameText, weight: 400, color: theme.nameText.color };
    items.push({ kind: 'group', id: 'equations', classes: ['equations'] });
    const cy = y + CAPTION_H / 2;
    layerFormulas(model).forEach((tex, i) => {
      if (!tex) return;
      const label = buildLabel(`$${tex}$`, style, engine, () => {});
      const width = label.width + 28;
      const group = `equation-${i}`;
      items.push({ kind: 'group', id: group, parent: 'equations', classes: ['equation'] });
      items.push({
        kind: 'rect',
        id: `${group}-box`,
        parent: group,
        classes: ['equation-box'],
        x: scene.width / 2 - width / 2,
        y: cy - CAPTION_H / 2,
        width,
        height: CAPTION_H,
        rx: CAPTION_H / 2,
        paint: {
          fill: mixColor(paper, forward, 0.08),
          stroke: forward,
          strokeWidth: 1.1,
          opacity: 0,
        },
      });
      const baseline = cy + (label.ascent - label.descent) / 2;
      for (const item of labelItems(
        `${group}-text`,
        ['equation-text'],
        label,
        scene.width / 2,
        baseline,
        style,
        engine,
        group,
      )) {
        items.push(
          item.kind === 'text' || item.kind === 'math'
            ? { ...item, paint: { ...item.paint, opacity: 0 } }
            : item,
        );
      }
    });
    y += CAPTION_H + 10;
  }

  if (loss) {
    // Axes, the curve still to come (dashed) and the curve so far (drawn as the loop plays).
    const style: TextStyle = { ...theme.sizeText };
    const left = theme.margin + 34;
    const right = scene.width - theme.margin;
    const top = y + 6;
    const bottom = top + LOSS_HEIGHT;
    const values = lossValues();
    const most = Math.max(...values);
    const px = (i: number) => left + ((right - left) * i) / (LOSS_POINTS - 1);
    const py = (v: number) => bottom - (LOSS_HEIGHT * v) / most;
    const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i)} ${py(v)}`).join('');
    items.push({ kind: 'group', id: 'loss', classes: ['loss'] });
    items.push({
      kind: 'path',
      id: 'loss-axes',
      parent: 'loss',
      classes: ['loss-axes'],
      d: `M${left} ${top}L${left} ${bottom}L${right} ${bottom}`,
      paint: { stroke: theme.sizeText.color, strokeWidth: 1, fill: 'none' },
    });
    items.push({
      kind: 'path',
      id: 'loss-future',
      parent: 'loss',
      classes: ['loss-future'],
      d,
      paint: { stroke: theme.edge.color, strokeWidth: 1.1, fill: 'none', dash: [3, 3] },
    });
    items.push({
      kind: 'path',
      id: 'loss-line',
      parent: 'loss',
      classes: ['loss-line'],
      d,
      paint: { stroke: backward, strokeWidth: 1.8, fill: 'none' },
    });
    items.push({
      kind: 'circle',
      id: 'loss-dot',
      parent: 'loss',
      classes: ['loss-dot'],
      cx: px(0),
      cy: py(values[0]!),
      r: 3.6,
      paint: { fill: backward, stroke: paper, strokeWidth: 1.2 },
    });
    const lossWord = buildLabel('loss', style, engine, () => {});
    items.push(
      ...labelItems(
        'loss-label',
        ['label'],
        lossWord,
        left - 6 - lossWord.width / 2,
        top + lossWord.ascent,
        style,
        engine,
        'loss',
      ),
    );
    const time = buildLabel('training', style, engine, () => {});
    items.push(
      ...labelItems(
        'loss-time',
        ['label'],
        time,
        right - time.width / 2,
        bottom + 4 + time.ascent,
        style,
        engine,
        'loss',
      ),
    );
    y = bottom + 4 + time.ascent + time.descent;
  }

  return { ...scene, animation: { items, height: y + theme.margin } };
}

/** The x and y of each loss point inside a scene laid out by applyAnimationItems. */
export function lossPoints(scene: Scene): [number, number][] {
  const line = scene.animation?.items.find((i) => i.id === 'loss-line');
  if (!line || line.kind !== 'path') return [];
  return [...line.d.matchAll(/[ML](-?[\d.]+) (-?[\d.e-]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}
