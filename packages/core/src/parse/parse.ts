import type { Document } from 'yaml';
import { diagnostic, type Diagnostic } from '../diagnostics.ts';
import { LIMITS, type Model } from '../model/schema.ts';
import {
  validateModel,
  type Locator,
  type ModelPath,
  type SourcePosition,
} from '../model/validate.ts';
import { isYamlLoaded, loadYaml, yaml } from './yaml.ts';

export type InputFormat = 'shorthand' | 'yaml' | 'json';

export interface ParseResult {
  readonly model?: Model;
  readonly format: InputFormat;
  readonly diagnostics: readonly Diagnostic[];
  /** The source is YAML or JSON and the YAML reader is still loading (see parseModelAsync). */
  readonly pending?: true;
}

type YamlDocument = Document.Parsed;

/**
 * Guesses the input format. A single line without YAML markers is shorthand; text starting with
 * `{` or `[` is JSON (parsed by the YAML parser, since JSON is valid YAML 1.2); anything else is YAML.
 */
export function detectFormat(text: string): InputFormat {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (!trimmed.includes('\n') && !/:\s|#|^-\s/.test(trimmed)) return 'shorthand';
  return 'yaml';
}

/** Parses untrusted text (shorthand, YAML or JSON) into a validated model. Never throws on bad input. */
export function parseModel(text: string): ParseResult {
  const format = detectFormat(text);
  if (text.length > LIMITS.inputChars) {
    return {
      format,
      diagnostics: [
        diagnostic(
          'error',
          'input.too-long',
          `The input is too long (${text.length} characters). The maximum is ${LIMITS.inputChars}.`,
        ),
      ],
    };
  }

  if (format === 'shorthand') {
    const leading = text.slice(0, text.length - text.trimStart().length);
    const lines = leading.split('\n');
    const origin: SourcePosition = { line: lines.length, column: (lines.at(-1) ?? '').length + 1 };
    return {
      format,
      ...validateModel(text.trim(), (path) => (path.length === 0 ? origin : undefined)),
    };
  }

  if (!isYamlLoaded()) return { format, diagnostics: [], pending: true };
  const { LineCounter, parseDocument } = yaml();
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, {
    lineCounter,
    prettyErrors: false,
    uniqueKeys: true,
    strict: true,
  });
  const at = (offset: number): SourcePosition => {
    const { line, col } = lineCounter.linePos(offset);
    return { line, column: col };
  };
  const diagnostics: Diagnostic[] = [];
  for (const error of doc.errors) {
    diagnostics.push(
      diagnostic(
        'error',
        `yaml.${error.code.toLowerCase()}`,
        firstLine(error.message),
        at(error.pos[0]),
      ),
    );
  }
  for (const warning of doc.warnings) {
    diagnostics.push(
      diagnostic(
        'warning',
        `yaml.${warning.code.toLowerCase()}`,
        firstLine(warning.message),
        at(warning.pos[0]),
      ),
    );
  }
  if (doc.errors.length > 0) return { format, diagnostics };

  let raw: unknown;
  try {
    raw = doc.toJS({ maxAliasCount: 100 });
  } catch (error) {
    diagnostics.push(
      diagnostic('error', 'yaml.to-js', firstLine(String((error as Error).message))),
    );
    return { format, diagnostics };
  }

  // A bare list of sizes becomes `layers`, so model paths start one level deeper than the document.
  const topIsList = Array.isArray(raw);
  const locate: Locator = (path, key) =>
    locateInDocument(doc, topIsList && path[0] === 'layers' ? path.slice(1) : path, key, at);
  const result = validateModel(raw, locate);
  const all = [...diagnostics, ...result.diagnostics];
  return result.model
    ? { model: result.model, format, diagnostics: all }
    : { format, diagnostics: all };
}

/** Like parseModel, but first loads the YAML reader when the source needs it. */
export async function parseModelAsync(text: string): Promise<ParseResult> {
  if (detectFormat(text) !== 'shorthand') await loadYaml();
  return parseModel(text);
}

function locateInDocument(
  doc: YamlDocument,
  path: ModelPath,
  key: string | undefined,
  at: (offset: number) => SourcePosition,
): SourcePosition | undefined {
  const { isMap, isNode, isScalar } = yaml();
  for (let depth = path.length; depth >= 0; depth--) {
    const node = depth === 0 ? doc.contents : doc.getIn(path.slice(0, depth), true);
    if (key !== undefined && depth === path.length && isMap(node)) {
      for (const pair of node.items) {
        if (isScalar(pair.key) && String(pair.key.value) === key && pair.key.range) {
          return at(pair.key.range[0]);
        }
      }
    }
    if (isNode(node) && node.range) return at(node.range[0]);
  }
  return undefined;
}

const firstLine = (message: string) => message.split('\n')[0]?.trim() ?? message;
