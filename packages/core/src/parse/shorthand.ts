// Shorthand grammar (single line, whitespace allowed around tokens):
//
//   model      = layer { separator layer }
//   separator  = "-" | "," | whitespace
//   layer      = ( size | call | word ) [ ":" activation ] [ "*" count ]
//   count      = digit { digit }                      1 .. LIMITS.layers (repeats the layer)
//   size       = digit { digit }                      1 .. LIMITS.units
//   call       = type "(" [ arg { "," arg } ] ")"  |  "gan(" model "|" model ")"
//   word       = "flatten" | "gap"                    (a call without arguments, parentheses optional)
//   arg        = dims | "s" dims | "same" | "valid" | "last"
//   dims       = size [ "x" size [ "x" size ] ]
//   activation = ( letter | "_" ) { letter | digit | "_" }
//
// Types (case-insensitive):
//   dense | fc | linear (units)                       a fully connected layer, like a plain size
//   in | input (H x W [x C])                          an image; C defaults to 1
//   conv | conv2d (filters, K [x K] [, sN] [, same | valid])
//   pool | maxpool | avgpool (K [x K] [, sN] [, same | valid])
//   gap, flatten
//   seq | sequence (steps [x features])               a sequence input; features default to 1
//   rnn | lstm | gru (units [, last])                 recurrent; a "bi" prefix reads both ways,
//                                                     "last" passes on only the last step
//   tokens (length), embed | embedding (width)        token ids, then their vectors
//   encoder | decoder (blocks, heads [, ff])          transformer blocks
//   gan (generator | discriminator)                   two fully connected networks
//   ae | autoencoder | vae (encoder [| decoder])      the decoder mirrors the encoder by default
//
// Examples: 784-16-16-10   784-128*3-10   4-8:relu-3:softmax
//           in(28x28x1)-conv(8,3x3):relu-pool(2)-flatten-fc(10)
//           seq(20x32)-lstm(64)-fc(10)   tokens(512)-embed(512)-encoder(6,8)-fc(2)
//           gan(100-256-784:tanh | 784-256-1:sigmoid)

import { diagnostic, type Diagnostic } from '../diagnostics.ts';
import { LIMITS, type DenseLayer, type Layer, type Model } from '../model/schema.ts';

/** A layer as the shorthand describes it: structure only (no names, labels or collapse rules). */
export type ShorthandLayer = Layer;

export interface ShorthandResult {
  readonly layers: readonly ShorthandLayer[];
  readonly diagnostics: readonly Diagnostic[];
}

type Kind =
  | 'dense'
  | 'input'
  | 'conv'
  | 'maxpool'
  | 'avgpool'
  | 'gap'
  | 'flatten'
  | 'sequence'
  | 'rnn'
  | 'lstm'
  | 'gru'
  | 'tokens'
  | 'embed'
  | 'encoder'
  | 'decoder'
  | 'gan'
  | 'autoencoder';

const TYPE_ALIASES: Readonly<Record<string, Kind>> = {
  dense: 'dense',
  fc: 'dense',
  linear: 'dense',
  in: 'input',
  input: 'input',
  conv: 'conv',
  conv2d: 'conv',
  pool: 'maxpool',
  maxpool: 'maxpool',
  avgpool: 'avgpool',
  gap: 'gap',
  flatten: 'flatten',
  seq: 'sequence',
  sequence: 'sequence',
  rnn: 'rnn',
  lstm: 'lstm',
  gru: 'gru',
  birnn: 'rnn',
  bilstm: 'lstm',
  bigru: 'gru',
  tokens: 'tokens',
  embed: 'embed',
  embedding: 'embed',
  encoder: 'encoder',
  decoder: 'decoder',
  gan: 'gan',
  ae: 'autoencoder',
  autoencoder: 'autoencoder',
  vae: 'autoencoder',
};

const TAKES_ACTIVATION = new Set<Kind>(['dense', 'conv', 'rnn', 'lstm', 'gru']);

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => /^[A-Za-z_]$/.test(c);
const isIdentChar = (c: string) => /^[A-Za-z0-9_]$/.test(c);
const isSpace = (c: string) => c === ' ' || c === '\t';

type Arg =
  | { readonly kind: 'dims'; readonly values: readonly number[]; readonly at: number }
  | { readonly kind: 'stride'; readonly values: readonly number[]; readonly at: number }
  | { readonly kind: 'padding'; readonly value: 'same' | 'valid'; readonly at: number }
  | { readonly kind: 'last'; readonly at: number };

class Failure {
  readonly result: ShorthandResult;
  constructor(result: ShorthandResult) {
    this.result = result;
  }
}

/** Parses a shorthand like `784-16-16-10`. Columns in diagnostics are 1-based within `source`. */
export function parseShorthand(source: string): ShorthandResult {
  try {
    return { layers: parseLayers(source), diagnostics: [] };
  } catch (error) {
    if (error instanceof Failure) return error.result;
    throw error;
  }
}

function parseLayers(source: string): ShorthandLayer[] {
  const layers: ShorthandLayer[] = [];
  let pos = 0;

  const peek = () => source[pos] ?? '';
  const shown = (at: number) => {
    const cp = source.codePointAt(at);
    return cp === undefined ? 'the end' : `'${String.fromCodePoint(cp)}'`;
  };
  const fail = (code: string, message: string, at = pos): never => {
    throw new Failure({
      layers: [],
      diagnostics: [diagnostic('error', code, message, { line: 1, column: at + 1 })],
    });
  };
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
  /** A whole number at pos; `max` and `what` shape the range message. */
  const readNumber = (max: number, what: string): number => {
    const at = pos;
    const digits = readWhile(isDigit);
    const value = Number(digits);
    if (digits.length > 7 || value > max) {
      fail('shorthand.size-range', `${what} ${digits} is too large. The maximum is ${max}.`, at);
    }
    if (value < 1) fail('shorthand.size-range', `${what}s must be at least 1.`, at);
    if (peek() === '.') fail('shorthand.size-whole', `${what}s must be whole numbers.`, pos);
    return value;
  };
  const readDims = (max: number, what: string): number[] => {
    const values = [readNumber(max, what)];
    for (;;) {
      const before = pos;
      skipSpace();
      if (!(peek() === 'x' || peek() === 'X' || peek() === '×') || values.length >= 3) {
        pos = before;
        return values;
      }
      pos++;
      skipSpace();
      if (!isDigit(peek())) fail('shorthand.expected-size', `Expected a number after 'x'.`);
      values.push(readNumber(max, what));
    }
  };

  const readArgs = (word: string): Arg[] => {
    const args: Arg[] = [];
    skipSpace();
    if (peek() === ')') return args;
    for (;;) {
      skipSpace();
      const at = pos;
      if (isDigit(peek())) {
        args.push({ kind: 'dims', values: readDims(LIMITS.units, 'Size'), at });
      } else if (isIdentStart(peek())) {
        const ident = readWhile(isIdentChar);
        const lower = ident.toLowerCase();
        if (lower === 'same' || lower === 'valid') args.push({ kind: 'padding', value: lower, at });
        else if (lower === 'last') args.push({ kind: 'last', at });
        else if (/^s\d/i.test(ident)) {
          pos = at + 1;
          args.push({ kind: 'stride', values: readDims(LIMITS.window, 'Stride'), at });
        } else {
          fail(
            'shorthand.unknown-option',
            `Unknown option '${ident}' in ${word}( ). Options are sizes like 3x3, a stride like s2, same or valid, and last.`,
            at,
          );
        }
      } else if (pos >= source.length) {
        fail('shorthand.expected-paren', `Expected ')' to close ${word}(.`);
      } else {
        fail('shorthand.unexpected', `Unexpected ${shown(pos)} in ${word}( ).`);
      }
      skipSpace();
      if (peek() === ',') {
        pos++;
        continue;
      }
      if (peek() === ')') return args;
      if (pos >= source.length) {
        const last = args.at(-1);
        const text = last?.kind === 'dims' ? last.values.join('x') : '';
        fail('shorthand.expected-paren', `Expected ')' after ${word}(${text}.`);
      }
      fail(
        'shorthand.unexpected',
        `Unexpected ${shown(pos)} in ${word}( ). Separate options with commas.`,
      );
    }
  };

  /** Builds a typed layer from its arguments, or fails with a message about what is missing. */
  const typed = (kind: Kind, word: string, args: Arg[], close: number): Layer => {
    const dims = args.filter((a) => a.kind === 'dims');
    const stride = args.find((a) => a.kind === 'stride');
    const padding = args.find((a) => a.kind === 'padding');
    const last = args.find((a) => a.kind === 'last');
    const reject = (arg: Arg | undefined, what: string) => {
      if (arg) fail('shorthand.unexpected-option', `${word}( ) does not take ${what}.`, arg.at);
    };
    if (kind !== 'rnn' && kind !== 'lstm' && kind !== 'gru') reject(last, "'last'");
    /** Plain whole numbers (no 3x3 sizes), each within its range. */
    const numbers = (
      what: string,
      ranges: readonly (readonly [string, number])[],
      required: number,
    ): number[] => {
      const usage = `${word}(${ranges
        .slice(0, required)
        .map(([n]) => n)
        .join(',')})`;
      reject(stride, 'a stride');
      reject(padding, 'padding');
      if (dims.length < required) {
        fail(
          'shorthand.expected-size',
          `Expected ${what} inside ${word}( ), like ${usage}.`,
          dims[0]?.at ?? close,
        );
      }
      if (dims.length > ranges.length) {
        fail(
          'shorthand.unexpected',
          `${word}( ) takes at most ${ranges.length} numbers.`,
          dims[ranges.length]!.at,
        );
      }
      return dims.map((d, i) => {
        if (d.values.length > 1)
          fail('shorthand.unexpected', `${word}( ) takes plain numbers, like ${usage}.`, d.at);
        const [label, max] = ranges[i]!;
        if (d.values[0]! > max) {
          fail(
            'shorthand.size-range',
            `${label} ${d.values[0]} is too large. The maximum is ${max}.`,
            d.at,
          );
        }
        return d.values[0]!;
      });
    };
    const window = (values: readonly number[], at: number): number | [number, number] => {
      if (values.length > 2) {
        fail('shorthand.unexpected', `A window size has at most two numbers, like 3x3.`, at);
      }
      for (const v of values) {
        if (v > LIMITS.window) {
          fail(
            'shorthand.size-range',
            `Window size ${v} is too large. The maximum is ${LIMITS.window}.`,
            at,
          );
        }
      }
      const [h, w = h] = values as [number, number?];
      return h === w ? h : [h, w];
    };
    switch (kind) {
      case 'dense': {
        reject(stride, 'a stride');
        reject(padding, 'padding');
        const [size] = dims;
        if (!size) {
          return fail(
            'shorthand.expected-size',
            `Expected a layer size inside ${word}( ), like ${word}(16).`,
            close,
          );
        }
        if (size.values.length > 1 || dims.length > 1) {
          return fail(
            'shorthand.unexpected',
            `${word}( ) takes one size, like ${word}(16).`,
            size.at,
          );
        }
        return { type: 'dense', units: size.values[0]! };
      }
      case 'input': {
        reject(stride, 'a stride');
        reject(padding, 'padding');
        const [shape] = dims;
        if (!shape || shape.values.length < 2 || dims.length > 1) {
          return fail(
            'shorthand.expected-shape',
            `Expected an image size inside ${word}( ), like ${word}(28x28x1) or ${word}(32x32x3).`,
            shape?.at ?? close,
          );
        }
        const [h, w, c] = shape.values as [number, number, number?];
        for (const side of [h, w]) {
          if (side > LIMITS.side) {
            fail(
              'shorthand.size-range',
              `Image size ${side} is too large. The maximum is ${LIMITS.side}.`,
              shape.at,
            );
          }
        }
        if (c !== undefined && c > LIMITS.channels) {
          fail(
            'shorthand.size-range',
            `Channel count ${c} is too large. The maximum is ${LIMITS.channels}.`,
            shape.at,
          );
        }
        return { type: 'input', shape: c === undefined ? [h, w] : [h, w, c] };
      }
      case 'conv': {
        const [filters, kernel, extra] = dims;
        if (!filters || !kernel) {
          return fail(
            'shorthand.expected-kernel',
            `Expected filters and a kernel size inside ${word}( ), like ${word}(16,3x3).`,
            filters?.at ?? close,
          );
        }
        if (filters.values.length > 1) {
          return fail(
            'shorthand.unexpected',
            `The first number in ${word}( ) is the filter count, like ${word}(16,3x3).`,
            filters.at,
          );
        }
        if (extra)
          return fail(
            'shorthand.unexpected',
            `${word}( ) takes filters and one kernel size.`,
            extra.at,
          );
        if (filters.values[0]! > LIMITS.channels) {
          fail(
            'shorthand.size-range',
            `Filter count ${filters.values[0]} is too large. The maximum is ${LIMITS.channels}.`,
            filters.at,
          );
        }
        return {
          type: 'conv',
          filters: filters.values[0]!,
          kernel: window(kernel.values, kernel.at),
          ...(stride ? { stride: window(stride.values, stride.at) } : {}),
          ...(padding ? { padding: padding.value } : {}),
        };
      }
      case 'maxpool':
      case 'avgpool': {
        const [size, extra] = dims;
        if (!size) {
          return fail(
            'shorthand.expected-size',
            `Expected a window size inside ${word}( ), like ${word}(2).`,
            close,
          );
        }
        if (extra)
          return fail('shorthand.unexpected', `${word}( ) takes one window size.`, extra.at);
        return {
          type: 'pool',
          size: window(size.values, size.at),
          ...(stride ? { stride: window(stride.values, stride.at) } : {}),
          ...(padding ? { padding: padding.value } : {}),
          ...(kind === 'avgpool' ? { mode: 'avg' as const } : {}),
        };
      }
      case 'gap':
      case 'flatten':
        if (args[0]) fail('shorthand.unexpected-option', `${word} takes no options.`, args[0].at);
        return { type: kind };
      case 'sequence': {
        reject(stride, 'a stride');
        reject(padding, 'padding');
        const [shape, extra] = dims;
        if (!shape || extra || shape.values.length > 2) {
          return fail(
            'shorthand.expected-shape',
            `Expected steps and features inside ${word}( ), like ${word}(20x32).`,
            (extra ?? shape)?.at ?? close,
          );
        }
        const [steps, features = 1] = shape.values as [number, number?];
        if (steps > LIMITS.steps) {
          fail(
            'shorthand.size-range',
            `Step count ${steps} is too large. The maximum is ${LIMITS.steps}.`,
            shape.at,
          );
        }
        return { type: 'sequence', steps, features };
      }
      case 'rnn':
      case 'lstm':
      case 'gru': {
        const [units] = numbers('a unit count', [['Unit count', LIMITS.units]], 1);
        return {
          type: kind,
          units: units!,
          ...(/^bi/i.test(word) ? { bidirectional: true } : {}),
          ...(last ? { last: true } : {}),
        };
      }
      case 'tokens': {
        const [length] = numbers('a length', [['Token count', LIMITS.steps]], 1);
        return { type: 'tokens', length: length! };
      }
      case 'embed': {
        const [width] = numbers('a width', [['Width', LIMITS.units]], 1);
        return { type: 'embed', width: width! };
      }
      case 'encoder':
      case 'decoder': {
        const [blocks, heads, ff] = numbers(
          'blocks and heads',
          [
            ['Block count', LIMITS.blocks],
            ['Head count', LIMITS.heads],
            ['Feed-forward width', LIMITS.units],
          ],
          2,
        );
        return { type: kind, blocks: blocks!, heads: heads!, ...(ff ? { ff } : {}) };
      }
      case 'gan':
      case 'autoencoder':
        return fail('shorthand.unexpected', `Expected ${word}( ) with layer sizes inside.`, close);
    }
  };

  /**
   * gan(100-256-784 | 784-256-1) and ae(784-256-32 [| 32-256-784]): fully connected networks,
   * each parsed like a whole shorthand.
   */
  const networksCall = (word: string, open: number, kind: 'gan' | 'autoencoder'): Layer => {
    const roles = kind === 'gan' ? ['generator', 'discriminator'] : ['encoder', 'decoder'];
    const usage = kind === 'gan' ? `${word}(100-256-784 | 784-256-1)` : `${word}(784-256-32)`;
    let depth = 0;
    let bar = -1;
    let close = -1;
    for (let i = open + 1; i < source.length; i++) {
      const c = source[i];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) {
          close = i;
          break;
        }
        depth--;
      } else if (c === '|' && depth === 0) {
        if (bar >= 0)
          fail('shorthand.unexpected', `${word}( ) takes two networks separated by one '|'.`, i);
        bar = i;
      }
    }
    if (close < 0)
      fail('shorthand.expected-paren', `Expected ')' to close ${word}(.`, source.length);
    if (bar < 0 && kind === 'gan') {
      fail(
        'shorthand.expected-gan',
        `Expected a generator and a discriminator separated by '|', like ${usage}.`,
        close,
      );
    }
    const part = (from: number, to: number, role: string) => {
      const text = source.slice(from, to);
      const lead = text.length - text.trimStart().length;
      const result = parseShorthand(text.trim());
      const error = result.diagnostics[0];
      if (error) {
        throw new Failure({
          layers: [],
          diagnostics: [
            {
              ...error,
              column: from + lead + (error.column ?? 1),
              message: `In the ${role}: ${error.message}`,
            },
          ],
        });
      }
      const typedLayer = result.layers.find((l) => l.type !== 'dense');
      if (typedLayer) {
        fail(
          'shorthand.gan-dense',
          `The ${role} takes layer sizes only, like ${usage}.`,
          from + lead,
        );
      }
      if (result.layers.length < 2) {
        fail(
          'shorthand.gan-short',
          `The ${role} needs at least two layers, like 100-784.`,
          from + lead,
        );
      }
      return result.layers as DenseLayer[];
    };
    const first = part(open + 1, bar < 0 ? close : bar, roles[0]!);
    const second = bar < 0 ? undefined : part(bar + 1, close, roles[1]!);
    pos = close + 1;
    if (kind === 'gan') return { type: 'gan', generator: first, discriminator: second! };
    return {
      type: 'autoencoder',
      encoder: first,
      ...(second ? { decoder: second } : {}),
      ...(/^vae$/i.test(word) ? { vae: true } : {}),
    };
  };

  skipSpace();
  if (pos >= source.length) {
    fail('shorthand.empty', 'Type layer sizes separated by hyphens, for example 784-16-16-10.');
  }

  for (;;) {
    const start = pos;
    let layer: Layer;
    let kind: Kind = 'dense';
    let word = '';

    if (isDigit(peek())) {
      const digits = source.slice(pos).match(/^\d+/)![0];
      const units = readNumber(LIMITS.units, 'Layer size');
      if (isIdentStart(peek())) {
        fail(
          'shorthand.unexpected',
          `Unexpected ${shown(pos)} after ${digits}. Put a colon before an activation, like ${digits}:relu.`,
        );
      }
      layer = { type: 'dense', units };
    } else if (isIdentStart(peek())) {
      word = readWhile(isIdentChar);
      const found = TYPE_ALIASES[word.toLowerCase()];
      const afterWord = pos;
      skipSpace();
      if (peek() !== '(') {
        if (found === 'flatten' || found === 'gap') {
          pos = afterWord;
          kind = found;
          layer = { type: found };
        } else {
          return fail(
            found ? 'shorthand.expected-paren' : 'shorthand.unknown-word',
            found
              ? `Expected '(' after ${word}, like ${example(found, word)}.`
              : `Unknown word '${word}'. Layers are sizes like 16, optionally with an activation like 16:relu.`,
            found ? pos : start,
          );
        }
      } else {
        if (!found) {
          return fail(
            'shorthand.unknown-type',
            `Layer type '${word}' is not supported. Use a number, dense, in, conv, pool, avgpool, gap, flatten, seq, rnn, lstm, gru, tokens, embed, encoder, decoder, gan or ae.`,
            start,
          );
        }
        kind = found;
        if (kind === 'gan' || kind === 'autoencoder') {
          layer = networksCall(word, pos, kind);
        } else {
          pos++;
          const args = readArgs(word);
          const close = pos;
          pos++;
          layer = typed(kind, word, args, close);
        }
      }
    } else {
      return fail(
        'shorthand.expected-size',
        `Expected a layer size like 16 but found ${shown(pos)}.`,
      );
    }

    if (peek() === ':') {
      const colon = pos;
      pos++;
      if (!isIdentStart(peek())) {
        fail(
          'shorthand.expected-activation',
          'Expected an activation name after the colon, like relu.',
        );
      }
      const actStart = pos;
      const activation = readWhile(isIdentChar);
      if (activation.length > LIMITS.activation) {
        fail(
          'shorthand.activation-length',
          `Activation names can be at most ${LIMITS.activation} characters long.`,
          actStart,
        );
      }
      if (!TAKES_ACTIVATION.has(kind)) {
        fail('shorthand.no-activation', `${word || kind} layers do not take an activation.`, colon);
      }
      layer = { ...layer, activation } as Layer;
    }

    let count = 1;
    const beforeCount = pos;
    skipSpace();
    if (peek() === '*') {
      pos++;
      skipSpace();
      if (!isDigit(peek())) {
        fail('shorthand.expected-count', `Expected a repeat count after '*', like 128*3.`);
      }
      count = readNumber(LIMITS.layers, 'Repeat count');
      if (isIdentStart(peek())) fail('shorthand.unexpected', `Unexpected ${shown(pos)}.`);
    } else {
      pos = beforeCount;
    }

    for (let i = 0; i < count; i++) layers.push(layer);
    if (layers.length > LIMITS.layers) {
      fail('shorthand.too-many', `Too many layers. The maximum is ${LIMITS.layers}.`, start);
    }

    const spaced = skipSpace();
    if (pos >= source.length) break;
    const separator = peek();
    if (separator === '-' || separator === ',') {
      pos++;
      skipSpace();
      if (pos >= source.length) {
        fail(
          'shorthand.trailing-separator',
          `Expected another layer after '${separator}'.`,
          pos - 1,
        );
      }
      continue;
    }
    if (spaced) continue;
    fail(
      'shorthand.unexpected',
      `Unexpected ${shown(pos)}. Separate layers with hyphens, like 784-16-10.`,
    );
  }

  return layers;
}

function example(kind: Kind, word: string): string {
  switch (kind) {
    case 'input':
      return `${word}(28x28x1)`;
    case 'conv':
      return `${word}(16,3x3)`;
    case 'maxpool':
    case 'avgpool':
      return `${word}(2)`;
    case 'sequence':
      return `${word}(20x32)`;
    case 'tokens':
    case 'embed':
      return `${word}(512)`;
    case 'encoder':
    case 'decoder':
      return `${word}(6,8)`;
    case 'gan':
      return `${word}(100-256-784 | 784-256-1)`;
    case 'autoencoder':
      return `${word}(784-256-32)`;
    default:
      return `${word}(16)`;
  }
}

const dims = (value: number | readonly [number, number]) =>
  typeof value === 'number' ? `${value}x${value}` : `${value[0]}x${value[1]}`;
const stride = (value: number | readonly [number, number]) =>
  typeof value === 'number' ? `s${value}` : `s${value[0]}x${value[1]}`;

/** One layer as a shorthand token (structure only: names and labels are left out). */
export function layerToken(layer: Layer): string {
  const act = 'activation' in layer && layer.activation !== undefined ? `:${layer.activation}` : '';
  switch (layer.type) {
    case 'dense':
      return `${layer.units}${act}`;
    case 'input':
      return `in(${layer.shape.join('x')})`;
    case 'conv': {
      const args = [String(layer.filters), dims(layer.kernel)];
      if (layer.stride !== undefined) args.push(stride(layer.stride));
      if (layer.padding !== undefined) args.push(layer.padding);
      return `conv(${args.join(',')})${act}`;
    }
    case 'pool': {
      const args = [typeof layer.size === 'number' ? String(layer.size) : dims(layer.size)];
      if (layer.stride !== undefined) args.push(stride(layer.stride));
      if (layer.padding !== undefined) args.push(layer.padding);
      return `${layer.mode === 'avg' ? 'avgpool' : 'pool'}(${args.join(',')})`;
    }
    case 'gap':
    case 'flatten':
      return layer.type;
    case 'sequence':
      return `seq(${layer.features === 1 ? layer.steps : `${layer.steps}x${layer.features}`})`;
    case 'rnn':
    case 'lstm':
    case 'gru':
      return `${layer.bidirectional ? 'bi' : ''}${layer.type}(${layer.units}${layer.last ? ',last' : ''})${act}`;
    case 'tokens':
      return `tokens(${layer.length})`;
    case 'embed':
      return `embed(${layer.width})`;
    case 'encoder':
    case 'decoder':
      return `${layer.type}(${layer.blocks},${layer.heads}${layer.ff === undefined ? '' : `,${layer.ff}`})`;
    case 'gan':
      return `gan(${layer.generator.map(layerToken).join('-')} | ${layer.discriminator.map(layerToken).join('-')})`;
    case 'autoencoder': {
      const decoder = layer.decoder ? ` | ${layer.decoder.map(layerToken).join('-')}` : '';
      return `${layer.vae ? 'vae' : 'ae'}(${layer.encoder.map(layerToken).join('-')}${decoder})`;
    }
  }
}

export interface ShorthandFormat {
  /** Write runs of identical layers once with a count: 784-128*3-10. */
  readonly repeat?: boolean;
}

/** Returns the shorthand for a model, or undefined when the model uses options the shorthand cannot express. */
export function formatShorthand(model: Model, format: ShorthandFormat = {}): string | undefined {
  if (
    model.title !== undefined ||
    model.description !== undefined ||
    model.style !== undefined ||
    model.animation !== undefined
  ) {
    return undefined;
  }
  const parts: string[] = [];
  for (const layer of model.layers) {
    if (layer.name !== undefined) return undefined;
    if (layer.type === 'dense' && (layer.collapse !== undefined || layer.nodeLabel !== undefined)) {
      return undefined;
    }
    const inner =
      layer.type === 'gan'
        ? [...layer.generator, ...layer.discriminator]
        : layer.type === 'autoencoder'
          ? [...layer.encoder, ...(layer.decoder ?? [])]
          : [];
    if (
      inner.some(
        (l) => l.name !== undefined || l.collapse !== undefined || l.nodeLabel !== undefined,
      )
    ) {
      return undefined;
    }
    parts.push(layerToken(layer));
  }
  return joinTokens(parts, format);
}

/** Joins layer tokens with hyphens, folding runs of equal ones into 128*3 when asked. */
export function joinTokens(tokens: readonly string[], format: ShorthandFormat = {}): string {
  return (format.repeat ? repeatRuns(tokens) : tokens).join('-');
}

/** Folds runs of equal tokens: [784, 128, 128, 128, 10] becomes [784, 128*3, 10]. */
function repeatRuns(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length;) {
    let end = i + 1;
    while (tokens[end] === tokens[i]) end++;
    out.push(end - i > 1 ? `${tokens[i]}*${end - i}` : tokens[i]!);
    i = end;
  }
  return out;
}
