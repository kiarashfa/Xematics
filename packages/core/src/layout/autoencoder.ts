// Layout for autoencoders: the input column, an encoder funnel narrowing into the latent column,
// a decoder funnel widening out of it (the two overlap at the latent space), and the output
// column. Collapsed columns draw fewer neurons toward the latent space, so the funnels keep their
// shape. A variational autoencoder draws a mean (μ) and spread (σ) column at the end of the
// encoder and the sampled latent (z) at the start of the decoder.
// Also draws a plain fully connected network this way (style.autoencoder), split at its
// smallest layer. Pure and deterministic: only + - * / and sqrt.

import { mixColor } from '../animate/random.ts';
import type { DenseLayer, Model } from '../model/schema.ts';
import type { Paint } from '../scene.ts';
import type { RolePaint, TextStyle, Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { Painter } from './draw.ts';
import { cleanLabel, slotsOf, type LayoutResult, type Slot } from './mlp.ts';

interface Column {
  readonly units: number;
  readonly layer: DenseLayer;
  readonly slots: Slot[];
  /** 'mean' and 'spread' share one x in a variational autoencoder (stacked). */
  readonly kind: 'input' | 'hidden' | 'latent' | 'mean' | 'sampled' | 'output';
  readonly name: string;
}

/** The encoder and decoder of an autoencoder layer, or of a plain network split at its smallest layer. */
export function autoencoderParts(model: Model): {
  encoder: DenseLayer[];
  decoder: DenseLayer[];
  vae: boolean;
  name: string | undefined;
} {
  const layer = model.layers[0];
  if (layer?.type === 'autoencoder') {
    const encoder = [...layer.encoder];
    const decoder = layer.decoder
      ? [...layer.decoder]
      : [...layer.encoder].reverse().map((l): DenseLayer => ({ type: 'dense', units: l.units }));
    return { encoder, decoder, vae: layer.vae === true, name: layer.name };
  }
  const dense = model.layers.filter((l): l is DenseLayer => l.type === 'dense');
  let latent = 1;
  dense.forEach((l, i) => {
    if (i > 0 && i < dense.length - 1 && l.units < dense[latent]!.units) latent = i;
  });
  return {
    encoder: dense.slice(0, latent + 1),
    decoder: dense.slice(latent),
    vae: false,
    name: undefined,
  };
}

export function layoutAutoencoder(model: Model, theme: Theme, engine: TextEngine): LayoutResult {
  const painter = new Painter(theme, engine, []);
  const { encoder, decoder, vae } = autoencoderParts(model);
  const r = theme.maps.nodeRadius;
  const pitch = 2 * r + Math.max(5, theme.maps.nodeSpacing);
  const most = theme.collapse.first + theme.collapse.last + 1;
  const fromAe = model.layers[0]?.type === 'autoencoder';

  // Columns in order. The decoder's first layer is the latent itself when the sizes agree.
  const latentUnits = encoder.at(-1)!.units;
  const tail = decoder[0]!.units === latentUnits ? decoder.slice(1) : decoder;
  const named = (l: DenseLayer, auto: string) =>
    l.name === undefined || fromAe ? auto : cleanLabel(l.name);
  const specs: Omit<Column, 'slots'>[] = [
    ...encoder.slice(0, -1).map((layer, i) => ({
      units: layer.units,
      layer,
      kind: i === 0 ? ('input' as const) : ('hidden' as const),
      name:
        i === 0
          ? named(layer, 'Input')
          : layer.name !== undefined && !fromAe
            ? cleanLabel(layer.name)
            : '',
    })),
    ...(vae
      ? [
          { units: latentUnits, layer: encoder.at(-1)!, kind: 'mean' as const, name: 'μ, σ' },
          { units: latentUnits, layer: encoder.at(-1)!, kind: 'sampled' as const, name: 'z' },
        ]
      : [
          {
            units: latentUnits,
            layer: encoder.at(-1)!,
            kind: 'latent' as const,
            name: named(encoder.at(-1)!, 'Latent space'),
          },
        ]),
    ...tail.map((layer, i) => ({
      units: layer.units,
      layer,
      kind: i === tail.length - 1 ? ('output' as const) : ('hidden' as const),
      name:
        i === tail.length - 1
          ? named(layer, 'Output')
          : layer.name !== undefined && !fromAe
            ? cleanLabel(layer.name)
            : '',
    })),
  ];
  const latentAt = specs.findIndex((c) => c.kind === 'latent' || c.kind === 'mean');
  const decoderAt = vae ? latentAt + 1 : latentAt;
  const count = specs.length;
  // Distance from the latent space, 0 there and 1 at the input and output, sets how many neurons show.
  const columns: Column[] = specs.map((spec, i) => {
    const full = slotsOf(
      spec.layer.units === spec.units ? spec.layer : { type: 'dense', units: spec.units },
      theme,
    ).slots;
    const span = i <= latentAt ? latentAt : count - 1 - decoderAt;
    const t = span <= 0 ? 1 : i <= latentAt ? (latentAt - i) / span : (i - decoderAt) / span;
    const stacked = spec.kind === 'mean';
    const capMost = stacked ? 3 : most;
    if (!full.includes('ellipsis') && !(stacked && full.length > 3))
      return { ...spec, slots: full };
    const cap = Math.min(full.length, stacked ? 3 : Math.max(3, 3 + Math.round((capMost - 3) * t)));
    const first = Math.floor((cap - 1) / 2);
    const last = cap - 1 - first;
    return {
      ...spec,
      slots: [
        ...Array.from({ length: first }, (_, k) => k),
        'ellipsis' as const,
        ...Array.from({ length: last }, (_, k) => spec.units - last + k),
      ],
    };
  });

  // Labels and sizes under every column.
  const sizeLabel = (c: Column) =>
    theme.labels.sizes ? painter.measure(String(c.units), theme.sizeText) : undefined;
  const nameLabel = (c: Column) =>
    theme.labels.names && c.name ? painter.measure(c.name, theme.nameText) : undefined;
  const labels = columns.map((c) => ({ name: nameLabel(c), size: sizeLabel(c) }));
  const half = (k: number) =>
    Math.max(labels[k]!.name?.width ?? 0, labels[k]!.size?.width ?? 0) / 2;

  const xs: number[] = [];
  const step = Math.max(58, (theme.layerSpacing * 58) / 110);
  columns.forEach((_, k) => {
    if (k === 0) {
      xs.push(theme.margin + Math.max(r, half(0)));
      return;
    }
    xs.push(xs[k - 1]! + Math.max(step, half(k - 1) + half(k) + theme.labelPadding));
  });
  const width = xs.at(-1)! + Math.max(r, half(count - 1)) + theme.margin;

  // The mean and spread of a variational autoencoder stand side by side, SIDE apart from the center.
  const SIDE = r + 5;
  const columnHeight = (c: Column) => (c.slots.length - 1) * pitch + 2 * r;
  const funnelEnd = (k: number) => columnHeight(columns[k]!) + 22;
  const encoderStart = Math.min(1, latentAt);
  const decoderEnd = Math.max(count - 2, decoderAt);
  const e0 = encoderStart === latentAt ? xs[latentAt]! - 40 : xs[encoderStart]! - 22;
  const e1 = xs[latentAt]! + 24 + (vae ? SIDE : 0);
  const d0 = xs[decoderAt]! - 24;
  const d1 = decoderEnd === decoderAt ? xs[decoderAt]! + 40 : xs[decoderEnd]! + 22;
  const funnel = (a: number, b: number, ha: number, hb: number, from: number, to: number) => {
    // Grow both ends until every column between them fits.
    let scale = 1;
    for (let k = from; k <= to; k++) {
      const t = (xs[k]! - a) / (b - a);
      scale = Math.max(scale, funnelEnd(k) / (ha + (hb - ha) * t));
    }
    return [ha * scale, hb * scale] as const;
  };
  const [eWide, eNarrow] = funnel(
    e0,
    e1,
    funnelEnd(encoderStart) + 16,
    funnelEnd(latentAt),
    encoderStart,
    latentAt,
  );
  const [dNarrow, dWide] = funnel(
    d0,
    d1,
    funnelEnd(decoderAt),
    funnelEnd(decoderEnd) + 16,
    decoderAt,
    decoderEnd,
  );

  const nameLine = engine.shape('', theme.nameText, theme.nameText.size);
  const sizeLine = engine.shape('', theme.sizeText, theme.sizeText.size);
  const tallest = Math.max(eWide, dWide, ...columns.map(columnHeight));
  const titleBaseline = theme.margin + nameLine.ascent;
  const cy = titleBaseline + nameLine.descent + 8 + tallest / 2;
  let cursor = cy + tallest / 2 + theme.labelGap;
  let nameBaseline = 0;
  let sizeBaseline = 0;
  if (labels.some((l) => l.name)) {
    nameBaseline = cursor + nameLine.ascent;
    cursor = nameBaseline + nameLine.descent + theme.lineGap;
  }
  if (labels.some((l) => l.size)) {
    sizeBaseline = cursor + sizeLine.ascent;
    cursor = sizeBaseline + sizeLine.descent;
  }
  const height = cursor + theme.margin;

  // Funnels: the decoder sits on top with some see-through so the overlap shows both.
  const enc = theme.parts.generator;
  const dec = theme.parts.attention;
  const tint = (p: RolePaint) => mixColor(p.fill, theme.background ?? '#ffffff', 0.25);
  painter.group('funnels', ['funnels']);
  painter.polygon(
    'funnel-encoder',
    [
      [e0, cy - eWide / 2],
      [e1, cy - eNarrow / 2],
      [e1, cy + eNarrow / 2],
      [e0, cy + eWide / 2],
    ],
    { fill: tint(enc), stroke: enc.stroke, strokeWidth: 1.2 },
    { parent: 'funnels', classes: ['funnel', 'funnel-encoder'] },
  );
  painter.polygon(
    'funnel-decoder',
    [
      [d0, cy - dNarrow / 2],
      [d1, cy - dWide / 2],
      [d1, cy + dWide / 2],
      [d0, cy + dNarrow / 2],
    ],
    { fill: tint(dec), stroke: dec.stroke, strokeWidth: 1.2, opacity: 0.82 },
    { parent: 'funnels', classes: ['funnel', 'funnel-decoder'] },
  );

  // Neuron positions; the mean (μ) and spread (σ) halves of a variational latent stand side by side.
  const ys = (k: number): { slot: Slot; x: number; y: number; part: string }[] => {
    const c = columns[k]!;
    const one = (c.slots.length - 1) * pitch;
    const at = (dx: number, part: string) =>
      c.slots.map((slot, j) => ({ slot, x: xs[k]! + dx, y: cy - one / 2 + j * pitch, part }));
    return c.kind === 'mean' ? [...at(-SIDE, 'm'), ...at(SIDE, 's')] : at(0, '');
  };
  const edgePaint: Paint = { stroke: theme.edge.color, strokeWidth: theme.edge.width * 0.8 };
  for (let k = 1; k < count; k++) {
    const group = `edges-${k - 1}`;
    painter.group(group, ['edges']);
    for (const a of ys(k - 1)) {
      if (a.slot === 'ellipsis') continue;
      for (const b of ys(k)) {
        if (b.slot === 'ellipsis') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        painter.line(
          `edge-${k - 1}-${a.part}${a.slot}-${k}-${b.part}${b.slot}`,
          a.x + (dx / length) * r,
          a.y + (dy / length) * r,
          b.x - (dx / length) * r,
          b.y - (dy / length) * r,
          edgePaint,
          { parent: group, classes: ['edge'] },
        );
      }
    }
  }

  const latentFill = mixColor(theme.roles.hidden.fill, theme.roles.hidden.stroke, 0.2);
  columns.forEach((c, k) => {
    const role = c.kind === 'input' ? 'input' : c.kind === 'output' ? 'output' : 'hidden';
    const group = `layer-${k}`;
    painter.group(group, ['layer', `layer-${role}`]);
    const p = theme.roles[role];
    const fill =
      c.kind === 'latent' || c.kind === 'mean' || c.kind === 'sampled' ? latentFill : p.fill;
    const paint: Paint = { fill, stroke: p.stroke, strokeWidth: theme.nodeStrokeWidth * 0.85 };
    for (const n of ys(k)) {
      if (n.slot === 'ellipsis') {
        const id = `ellipsis-${k}${n.part}`;
        painter.group(id, ['ellipsis'], group);
        [-1, 0, 1].forEach((o, dot) =>
          painter.circle(
            `${id}-${dot}`,
            n.x,
            n.y + o * 5,
            1.7,
            { fill: theme.ellipsis.color },
            { parent: id },
          ),
        );
        continue;
      }
      painter.circle(`node-${k}-${n.part}${n.slot}`, n.x, n.y, r, paint, {
        parent: group,
        classes: ['node', `node-${role}`],
      });
    }
  });

  painter.group('labels', ['labels']);
  if (vae) {
    // μ and σ over their columns.
    const k = latentAt;
    const topY = ys(k)[0]!.y - r - 7;
    const style: TextStyle = { ...theme.maps.opText, size: theme.maps.opText.size + 1 };
    painter.label('label-mean', painter.measure('μ', style), xs[k]! - SIDE, topY, style, {
      classes: ['label', 'label-latent'],
    });
    painter.label('label-spread', painter.measure('σ', style), xs[k]! + SIDE, topY, style, {
      classes: ['label', 'label-latent'],
    });
  }
  const top = (title: string, x: number, color: string, id: string) => {
    if (!theme.labels.names) return;
    const style: TextStyle = { ...theme.nameText, color };
    painter.label(id, painter.measure(title, style), x, titleBaseline, style, {
      classes: ['label', 'label-part'],
    });
  };
  top('Encoder', (e0 + e1) / 2 - 8, enc.stroke, 'title-encoder');
  top('Decoder', (d0 + d1) / 2 + 8, dec.stroke, 'title-decoder');
  labels.forEach((l, k) => {
    if (l.name)
      painter.label(`name-${k}`, l.name, xs[k]!, nameBaseline, theme.nameText, {
        classes: ['label', 'label-name'],
      });
    if (l.size)
      painter.label(`size-${k}`, l.size, xs[k]!, sizeBaseline, theme.sizeText, {
        classes: ['label', 'label-size'],
      });
  });

  const scene = painter.finish(width, height, {
    title: cleanLabel(model.title ?? '') || 'Neural network diagram',
    description: cleanLabel(model.description ?? '') || describeAutoencoder(model),
    family: 'autoencoder',
  });
  return { scene, diagnostics: painter.diagnostics };
}

export function describeAutoencoder(model: Model): string {
  const { encoder, decoder, vae } = autoencoderParts(model);
  const sizes = (layers: readonly DenseLayer[]) => layers.map((l) => l.units).join(', ');
  const kind = vae ? 'Variational autoencoder' : 'Autoencoder';
  const latent = encoder.at(-1)!.units;
  return `${kind}: an encoder (${sizes(encoder)}) compresses the input to a latent space of ${latent} ${latent === 1 ? 'value' : 'values'}${vae ? ' sampled from a mean and a spread' : ''}, and a decoder (${sizes(decoder)}) rebuilds it.`;
}
