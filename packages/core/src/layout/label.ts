// Labels: plain text with optional inline math ($h^{(1)}$). Text runs are shaped by the text engine,
// formulas come from its MathJax cache; parts are placed on one line in visual order.

import type { MathItem, SceneItem, TextItem } from '../scene.ts';
import type { TextStyle } from '../style/theme.ts';
import type { ShapedText, TextEngine } from '../text/engine.ts';
import type { MathBox } from '../text/math.ts';
import { mathOutline } from '../text/math.ts';
import { num } from '../util/format.ts';

/** Math is set slightly larger than the label font so its x-height matches Inter's. */
export const MATH_SCALE = 1.1;

export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'math'; readonly tex: string };

type Part =
  | { readonly kind: 'text'; readonly shaped: ShapedText; readonly x: number }
  | {
      readonly kind: 'math';
      readonly tex: string;
      readonly box: MathBox;
      readonly size: number;
      readonly x: number;
    };

export interface Label {
  readonly width: number;
  /** Line box above and below the baseline (the font's, or taller when a formula needs it). */
  readonly ascent: number;
  readonly descent: number;
  readonly direction: 'ltr' | 'rtl';
  /** Parts in visual order; x is the offset from the label's left edge. */
  readonly parts: readonly Part[];
}

export type LabelIssue =
  | { readonly kind: 'missing'; readonly chars: readonly string[] }
  | { readonly kind: 'math'; readonly tex: string; readonly error: string };

/**
 * Splits a label into text and math. `$...$` is math; `\$` is a literal dollar sign; a `$` with
 * no closing partner is literal too.
 */
export function splitMath(text: string): Segment[] {
  const segments: Segment[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (char === '\\' && text[i + 1] === '$') {
      plain += '$';
      i += 2;
      continue;
    }
    if (char === '$') {
      const end = closingDollar(text, i + 1);
      if (end > i + 1) {
        if (plain) segments.push({ kind: 'text', text: plain });
        plain = '';
        segments.push({ kind: 'math', tex: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    plain += char;
    i++;
  }
  if (plain) segments.push({ kind: 'text', text: plain });
  return segments;
}

function closingDollar(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '$') return i;
  }
  return -1;
}

/** Writes segments back as label source (the inverse of splitMath). */
export function joinMath(segments: readonly Segment[]): string {
  return segments
    .map((s) => (s.kind === 'math' ? `$${s.tex}$` : s.text.replaceAll('$', '\\$')))
    .join('');
}

/** Node label for neuron n (1-based): `{i}` becomes the number, inside math as a TeX group. */
export function nodeLabelText(template: string, n: number): string {
  return joinMath(
    splitMath(template).map((s) =>
      s.kind === 'math'
        ? { kind: 'math', tex: s.tex.replaceAll('{i}', `{${n}}`) }
        : { kind: 'text', text: s.text.replaceAll('{i}', String(n)) },
    ),
  );
}

export function buildLabel(
  text: string,
  style: TextStyle,
  engine: TextEngine,
  report: (issue: LabelIssue) => void,
): Label {
  const segments = splitMath(text);
  const missing = new Set<string>();
  const shapeText = (t: string) => {
    const shaped = engine.shape(t, style, style.size);
    for (const char of shaped.missing) missing.add(char);
    return shaped;
  };

  if (segments.every((s) => s.kind === 'text')) {
    const shaped = shapeText(segments.map((s) => (s.kind === 'text' ? s.text : '')).join(''));
    if (missing.size > 0) report({ kind: 'missing', chars: [...missing] });
    return {
      width: shaped.width,
      ascent: shaped.ascent,
      descent: shaped.descent,
      direction: shaped.direction,
      parts: [{ kind: 'text', shaped, x: 0 }],
    };
  }

  const size = style.size * MATH_SCALE;
  type Piece = { kind: 'text'; shaped: ShapedText } | { kind: 'math'; tex: string; box: MathBox };
  const pieces: Piece[] = segments.map((segment) => {
    if (segment.kind === 'text') return { kind: 'text', shaped: shapeText(segment.text) };
    const result = engine.math(segment.tex);
    if (result && 'box' in result) return { kind: 'math', tex: segment.tex, box: result.box };
    // Not typeset yet, or invalid TeX: show the source so nothing silently disappears.
    if (result) report({ kind: 'math', tex: segment.tex, error: result.error });
    return { kind: 'text', shaped: shapeText(`$${segment.tex}$`) };
  });
  if (missing.size > 0) report({ kind: 'missing', chars: [...missing] });

  // The label's direction comes from its text (formulas are neutral); RTL labels read right to left.
  const textOnly = segments.map((s) => (s.kind === 'text' ? s.text : ' ')).join('');
  const direction = engine.shape(textOnly, style, style.size).direction;
  const visual = direction === 'rtl' ? [...pieces].reverse() : pieces;

  const line = engine.shape('', style, style.size);
  let ascent = line.ascent;
  let descent = line.descent;
  let x = 0;
  const parts: Part[] = visual.map((piece) => {
    const at = x;
    if (piece.kind === 'text') {
      x += piece.shaped.width;
      return { kind: 'text', shaped: piece.shaped, x: at };
    }
    x += piece.box.width * size;
    ascent = Math.max(ascent, piece.box.ascent * size);
    descent = Math.max(descent, piece.box.descent * size);
    return { kind: 'math', tex: piece.tex, box: piece.box, size, x: at };
  });
  return { width: x, ascent, descent, direction, parts };
}

/** Scene items for a label centered on x with its baseline at y. */
export function labelItems(
  id: string,
  classes: readonly string[],
  label: Label,
  x: number,
  y: number,
  style: TextStyle,
  engine: TextEngine,
  parent: string,
): SceneItem[] {
  const only = label.parts.length === 1 ? label.parts[0] : undefined;
  if (only?.kind === 'text')
    return [textItem(id, classes, only.shaped, x, y, style, engine, parent)];
  const left = x - label.width / 2;
  const items: SceneItem[] = [{ kind: 'group', id, parent, classes }];
  label.parts.forEach((part, k) => {
    const partId = `${id}-${k}`;
    if (part.kind === 'text') {
      items.push(
        textItem(
          partId,
          [],
          part.shaped,
          left + part.x + part.shaped.width / 2,
          y,
          style,
          engine,
          id,
        ),
      );
      return;
    }
    const math: MathItem = {
      kind: 'math',
      id: partId,
      parent: id,
      tex: part.tex,
      x: left + part.x,
      y,
      width: part.box.width * part.size,
      size: part.size,
      outline: mathOutline(part.box, left + part.x, y, part.size, num),
      paint: { fill: style.color },
    };
    items.push(math);
  });
  return items;
}

export function textItem(
  id: string,
  classes: readonly string[],
  shaped: ShapedText,
  x: number,
  y: number,
  style: TextStyle,
  engine: TextEngine,
  parent = 'labels',
): TextItem {
  return {
    kind: 'text',
    id,
    parent,
    ...(classes.length > 0 ? { classes } : {}),
    text: shaped.text,
    x,
    y,
    anchor: 'middle',
    direction: shaped.direction,
    font: { family: style.family, weight: style.weight, size: style.size },
    width: shaped.width,
    outline: engine.outline(shaped, x - shaped.width / 2, y),
    paint: { fill: style.color },
  };
}
