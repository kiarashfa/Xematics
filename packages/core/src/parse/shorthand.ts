// Shorthand grammar (single line, whitespace allowed around tokens):
//
//   model      = layer { separator layer }
//   separator  = "-" | "," | whitespace
//   layer      = ( size | type "(" size ")" ) [ ":" activation ]
//   size       = digit { digit }                      1 .. LIMITS.units
//   type       = "dense" | "fc" | "linear"            (case-insensitive aliases of dense)
//   activation = ( letter | "_" ) { letter | digit | "_" }
//
// Examples: 784-16-16-10   784, 128, 10   4-8:relu-3:softmax   dense(64)-dense(10):softmax

import { diagnostic, type Diagnostic } from '../diagnostics.ts';
import { LIMITS, type Model } from '../model/schema.ts';

export interface ShorthandLayer {
  readonly type: 'dense';
  readonly units: number;
  readonly activation?: string;
}

export interface ShorthandResult {
  readonly layers: readonly ShorthandLayer[];
  readonly diagnostics: readonly Diagnostic[];
}

const TYPE_ALIASES: Readonly<Record<string, 'dense'>> = {
  dense: 'dense',
  fc: 'dense',
  linear: 'dense',
};

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => /^[A-Za-z_]$/.test(c);
const isIdentChar = (c: string) => /^[A-Za-z0-9_]$/.test(c);
const isSpace = (c: string) => c === ' ' || c === '\t';

/** Parses a shorthand like `784-16-16-10`. Columns in diagnostics are 1-based within `source`. */
export function parseShorthand(source: string): ShorthandResult {
  const layers: ShorthandLayer[] = [];
  let pos = 0;

  const peek = () => source[pos] ?? '';
  const shown = (at: number) => {
    const cp = source.codePointAt(at);
    return cp === undefined ? 'the end' : `'${String.fromCodePoint(cp)}'`;
  };
  const fail = (code: string, message: string, at = pos): ShorthandResult => ({
    layers: [],
    diagnostics: [diagnostic('error', code, message, { line: 1, column: at + 1 })],
  });
  const skipSpace = () => {
    const start = pos;
    while (isSpace(peek())) pos++;
    return pos > start;
  };
  const readWhile = (test: (c: string) => boolean) => {
    const start = pos;
    while (test(peek())) pos++;
    return source.slice(start, pos);
  };
  const sizeError = (digits: string, at: number): ShorthandResult | undefined => {
    const units = Number(digits);
    if (digits.length > 7 || units > LIMITS.units) {
      return fail(
        'shorthand.size-range',
        `Layer size ${digits} is too large. The maximum is ${LIMITS.units}.`,
        at,
      );
    }
    if (units < 1) return fail('shorthand.size-range', 'Layer sizes must be at least 1.', at);
    if (peek() === '.')
      return fail('shorthand.size-whole', 'Layer sizes must be whole numbers.', pos);
    return undefined;
  };

  skipSpace();
  if (pos >= source.length) {
    return fail(
      'shorthand.empty',
      'Type layer sizes separated by hyphens, for example 784-16-16-10.',
    );
  }

  for (;;) {
    const start = pos;
    let units: number;

    if (isDigit(peek())) {
      const digits = readWhile(isDigit);
      const error = sizeError(digits, start);
      if (error) return error;
      if (isIdentStart(peek())) {
        return fail(
          'shorthand.unexpected',
          `Unexpected ${shown(pos)} after ${digits}. Put a colon before an activation, like ${digits}:relu.`,
        );
      }
      units = Number(digits);
    } else if (isIdentStart(peek())) {
      const word = readWhile(isIdentChar);
      skipSpace();
      if (peek() !== '(') {
        return fail(
          'shorthand.unknown-word',
          `Unknown word '${word}'. Layers are sizes like 16, optionally with an activation like 16:relu.`,
          start,
        );
      }
      if (!TYPE_ALIASES[word.toLowerCase()]) {
        return fail(
          'shorthand.unknown-type',
          `Layer type '${word}' is not supported yet. Supported: dense, or just a number.`,
          start,
        );
      }
      pos++;
      skipSpace();
      const sizeStart = pos;
      const digits = readWhile(isDigit);
      if (!digits) {
        return fail(
          'shorthand.expected-size',
          `Expected a layer size inside ${word}( ), like ${word}(16).`,
        );
      }
      const error = sizeError(digits, sizeStart);
      if (error) return error;
      skipSpace();
      if (peek() !== ')')
        return fail('shorthand.expected-paren', `Expected ')' after ${word}(${digits}.`);
      pos++;
      units = Number(digits);
    } else {
      return fail(
        'shorthand.expected-size',
        `Expected a layer size like 16 but found ${shown(pos)}.`,
      );
    }

    let activation: string | undefined;
    if (peek() === ':') {
      pos++;
      if (!isIdentStart(peek())) {
        return fail(
          'shorthand.expected-activation',
          'Expected an activation name after the colon, like relu.',
        );
      }
      const actStart = pos;
      activation = readWhile(isIdentChar);
      if (activation.length > LIMITS.activation) {
        return fail(
          'shorthand.activation-length',
          `Activation names can be at most ${LIMITS.activation} characters long.`,
          actStart,
        );
      }
    }

    layers.push(
      activation === undefined ? { type: 'dense', units } : { type: 'dense', units, activation },
    );
    if (layers.length > LIMITS.layers) {
      return fail('shorthand.too-many', `Too many layers. The maximum is ${LIMITS.layers}.`, start);
    }

    const spaced = skipSpace();
    if (pos >= source.length) break;
    const separator = peek();
    if (separator === '-' || separator === ',') {
      pos++;
      skipSpace();
      if (pos >= source.length) {
        return fail(
          'shorthand.trailing-separator',
          `Expected another layer after '${separator}'.`,
          pos - 1,
        );
      }
      continue;
    }
    if (spaced) continue;
    return fail(
      'shorthand.unexpected',
      `Unexpected ${shown(pos)}. Separate layers with hyphens, like 784-16-10.`,
    );
  }

  return { layers, diagnostics: [] };
}

/** Returns the shorthand for a model, or undefined when the model uses options the shorthand cannot express. */
export function formatShorthand(model: Model): string | undefined {
  if (model.title !== undefined || model.description !== undefined || model.style !== undefined) {
    return undefined;
  }
  const parts: string[] = [];
  for (const layer of model.layers) {
    if (layer.name !== undefined || layer.collapse !== undefined) return undefined;
    parts.push(
      layer.activation === undefined ? String(layer.units) : `${layer.units}:${layer.activation}`,
    );
  }
  return parts.join('-');
}
