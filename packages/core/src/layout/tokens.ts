// Attention figures for Transformers (style.transformer): 'tokens' draws one node per token per
// block, with an edge from every token a block attends to, its width and strength the attention
// weight; 'heatmap' draws one block's attention as a matrix. Decoder blocks are causal (a token
// sees only earlier ones), encoder blocks see every token. Weights are seeded, so every export
// matches; they show the pattern, not a trained model.
// Pure and deterministic: only + - * / and sqrt.

import { hash, mixColor, seeded } from '../animate/random.ts';
import type { Model } from '../model/schema.ts';
import { inferShapes } from '../model/shapes.ts';
import type { Paint } from '../scene.ts';
import { roleStroke, type Role, type TextStyle, type Theme } from '../style/theme.ts';
import type { TextEngine } from '../text/engine.ts';
import { Painter } from './draw.ts';
import type { Label } from './label.ts';
import { cleanLabel, type LayoutResult } from './mlp.ts';

/** Tokens drawn when the model names none. */
const DEFAULT_TOKENS = 6;
/** Rows of blocks drawn; longer stacks show the first ones and the last. */
const MAX_ROWS = 3;
const R = 9;
const ROW_GAP = 76;
const CELL = 30;

interface Row {
  readonly name: string;
  readonly causal: boolean;
}

/** The attention rows of a model: every encoder and decoder block, the first ones and the last. */
function blockRows(model: Model): Row[] {
  const blocks: Row[] = [];
  for (const layer of model.layers) {
    if (layer.type !== 'encoder' && layer.type !== 'decoder') continue;
    const word = layer.type === 'encoder' ? 'Encoder' : 'Decoder';
    const seen = blocks.filter((b) => b.name.startsWith(word)).length;
    for (let k = 0; k < layer.blocks; k++) {
      blocks.push({ name: `${word} ${seen + k + 1}`, causal: layer.type === 'decoder' });
    }
  }
  if (blocks.length <= MAX_ROWS) return blocks;
  return [...blocks.slice(0, MAX_ROWS - 1), blocks.at(-1)!];
}

/**
 * Attention weights of one row: for each query token, how much it takes from every key token.
 * Each token mostly keeps itself and its neighbour, with a seeded spread over the rest.
 */
export function attentionWeights(count: number, causal: boolean, seed: number): number[][] {
  const next = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const raw = Array.from({ length: count }, (_, j) => {
      if (causal && j > i) return 0;
      const u = next();
      return (j === i ? 0.6 : 0) + (j === i - 1 ? 0.25 : 0) + u * u * u;
    });
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((v) => Math.round((v / sum) * 1000) / 1000);
  });
}

/** Token words: the model's own, else t1, t2... for as many tokens as fit. */
function tokenWords(model: Model): { words: string[]; subscript: boolean } {
  if (model.tokens && model.tokens.length > 0) {
    return { words: model.tokens.map((w) => cleanLabel(w) || '?'), subscript: false };
  }
  const shapes = inferShapes(model).shapes;
  const first = shapes[0];
  const length = first && first.kind === 'seq' ? first.steps : DEFAULT_TOKENS;
  const n = Math.max(1, Math.min(DEFAULT_TOKENS, length));
  return { words: Array.from({ length: n }, (_, i) => String(i + 1)), subscript: true };
}

export function layoutAttention(model: Model, theme: Theme, engine: TextEngine): LayoutResult {
  const painter = new Painter(theme, engine, []);
  const rows = blockRows(model);
  if (rows.length === 0) rows.push({ name: 'Attention', causal: false });
  const { words, subscript } = tokenWords(model);
  const n = words.length;
  const seedBase = hash(`${n}:${words.join(' ')}:${rows.map((r) => r.name).join(',')}`);
  const weights = rows.map((row, k) => attentionWeights(n, row.causal, seedBase + k * 7919));
  const color = theme.parts.attention.stroke;
  const wordStyle: TextStyle = { ...theme.nameText, weight: 400, size: theme.sizeText.size + 1 };
  const nameStyle: TextStyle = theme.nameText;
  const measured = words.map((w) => painter.measure(w, wordStyle));
  const widest = Math.max(...measured.map((m) => m.width));
  const embed = model.layers.find((l) => l.type === 'embed');
  const embedName = embed?.name !== undefined ? cleanLabel(embed.name) : 'Embedding';
  const title = cleanLabel(model.title ?? '') || 'Neural network diagram';

  // A word, or t with the position as a subscript when the model names no words.
  const word = (
    id: string,
    k: number,
    x: number,
    cy: number,
    anchor: 'middle' | 'end' = 'middle',
  ) => {
    if (subscript) {
      painter.subscripted(id, 't', words[k]!, x, cy, wordStyle, {
        anchor,
        classes: ['label', 'label-token'],
      });
    } else if (anchor === 'end') {
      painter.label(
        id,
        measured[k]!,
        x,
        cy + (measured[k]!.ascent - measured[k]!.descent) / 2,
        wordStyle,
        {
          anchor: 'end',
          classes: ['label', 'label-token'],
        },
      );
    } else {
      painter.centered(id, measured[k]!, x, cy, wordStyle, { classes: ['label', 'label-token'] });
    }
  };

  if (theme.transformer === 'heatmap') {
    // One block's matrix: queries down the side, keys along the top.
    const row = rows.at(-1)!;
    const w = weights.at(-1)!;
    const cell = Math.max(CELL, Math.ceil(widest) + 10);
    const caption = painter.measure(row.name, nameStyle);
    const axisStyle: TextStyle = { ...theme.sizeText };
    const keys = painter.measure('keys', axisStyle);
    const queries = painter.measure('queries', axisStyle);
    const left = theme.margin + queries.ascent + queries.descent + 8 + widest + 8;
    const top = theme.margin + caption.ascent + caption.descent + 10 + wordStyle.size + 10;
    const paper = theme.background ?? '#ffffff';
    // Cells first, so the values and labels draw over them.
    painter.group('layer-0', ['layer', 'layer-hidden']);
    painter.group('labels', ['labels']);
    painter.label(
      'name-0',
      caption,
      left + (n * cell) / 2,
      theme.margin + caption.ascent,
      nameStyle,
      {
        classes: ['label', 'label-name'],
      },
    );
    const valueStyle = (v: number): TextStyle => ({
      ...theme.sizeText,
      size: theme.sizeText.size - 2,
      color: v > 0.4 ? '#ffffff' : theme.sizeText.color,
    });
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = w[i]![j]!;
        const masked = row.causal && j > i;
        const fill = masked
          ? mixColor(paper, theme.edge.color, 0.18)
          : mixColor(paper, color, Math.min(1, 0.1 + v * 1.4));
        painter.rect(
          `cell-${i}-${j}`,
          left + j * cell + 1,
          top + i * cell + 1,
          cell - 2,
          cell - 2,
          { fill },
          {
            parent: 'layer-0',
            classes: ['cell'],
            rx: 2,
          },
        );
        if (!masked) {
          const text = v > 0.995 ? '1' : v.toFixed(2).slice(1);
          const label = painter.measure(text, valueStyle(v));
          painter.centered(
            `value-${i}-${j}`,
            label,
            left + j * cell + cell / 2,
            top + i * cell + cell / 2,
            valueStyle(v),
            {
              classes: ['label', 'label-value'],
            },
          );
        }
      }
      word(`query-${i}`, i, left - 8, top + i * cell + cell / 2, 'end');
      word(`key-${i}`, i, left + i * cell + cell / 2, top - 10 - wordStyle.size / 2);
    }
    const bottom = top + n * cell;
    painter.label('axis-keys', keys, left + (n * cell) / 2, bottom + 8 + keys.ascent, axisStyle, {
      classes: ['label', 'label-axis'],
    });
    painter.turned(
      'axis-queries',
      queries,
      theme.margin + queries.ascent,
      top + (n * cell) / 2,
      axisStyle,
      {
        classes: ['label', 'label-axis'],
      },
    );
    const width = left + n * cell + theme.margin;
    const height = bottom + 8 + keys.ascent + keys.descent + theme.margin;
    const scene = painter.finish(width, height, {
      title,
      description:
        cleanLabel(model.description ?? '') ||
        `Attention matrix of ${row.name}: how much each of ${n} tokens takes from the others${row.causal ? ', each seeing only earlier tokens' : ''}.`,
      family: 'transformer',
    });
    return { scene, diagnostics: painter.diagnostics };
  }

  // Token flow: the embedding at the bottom, one row per drawn block above it.
  const names = [embedName, ...rows.map((r) => r.name)];
  const nameLabels: Label[] = names.map((name) => painter.measure(name, nameStyle));
  const labelWidth = Math.max(...nameLabels.map((l) => l.width));
  const pitch = Math.max(56, Math.ceil(widest) + 16);
  const lead = theme.margin + labelWidth + 24;
  const x = (i: number) => lead + R + i * pitch;
  const top = theme.margin + R;
  const levels = names.length;
  const y = (l: number) => top + (levels - 1 - l) * ROW_GAP;
  const wordY = y(0) + R + 6 + wordStyle.size / 2 + 4;

  for (let l = 1; l < levels; l++) {
    const group = `edges-${l - 1}`;
    painter.group(group, ['edges']);
    const w = weights[l - 1]!;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = w[i]![j]!;
        if (v === 0) continue;
        const paint: Paint = {
          stroke: color,
          strokeWidth: Math.round((0.5 + 3 * v) * 100) / 100,
          opacity: Math.round((0.18 + 0.82 * v) * 1000) / 1000,
        };
        const dx = x(i) - x(j);
        const dy = y(l) - y(l - 1);
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        painter.line(
          `edge-${l - 1}-${j}-${l}-${i}`,
          x(j) + (dx / length) * R,
          y(l - 1) + (dy / length) * R,
          x(i) - (dx / length) * R,
          y(l) - (dy / length) * R,
          paint,
          { parent: group, classes: ['edge', 'attention'] },
        );
      }
    }
  }
  for (let l = 0; l < levels; l++) {
    const role: Role = l === 0 ? 'input' : l === levels - 1 ? 'output' : 'hidden';
    const group = `layer-${l}`;
    painter.group(group, ['layer', `layer-${role}`]);
    const paint = theme.roles[role];
    for (let i = 0; i < n; i++) {
      painter.circle(
        `node-${l}-${i}`,
        x(i),
        y(l),
        R,
        { fill: paint.fill, ...roleStroke(theme, role, theme.nodeStrokeWidth) },
        { parent: group, classes: ['node', `node-${role}`] },
      );
    }
  }
  painter.group('labels', ['labels']);
  names.forEach((_, l) => {
    const label = nameLabels[l]!;
    painter.label(
      `name-${l}`,
      label,
      lead - 24,
      y(l) + (label.ascent - label.descent) / 2,
      nameStyle,
      {
        anchor: 'end',
        classes: ['label', 'label-name'],
      },
    );
  });
  for (let i = 0; i < n; i++) word(`token-${i}`, i, x(i), wordY);
  const width = x(n - 1) + R + theme.margin;
  const height = wordY + wordStyle.size / 2 + 4 + theme.margin;
  const kinds = rows.some((r) => r.causal)
    ? 'each token attending only to itself and earlier tokens'
    : 'every token attending to all tokens';
  const scene = painter.finish(width, height, {
    title,
    description:
      cleanLabel(model.description ?? '') ||
      `Attention between ${n} tokens through ${rows.length} ${rows.length === 1 ? 'block' : 'blocks'}, ${kinds}. Line width shows the attention weight.`,
    family: 'transformer',
  });
  return { scene, diagnostics: painter.diagnostics };
}
