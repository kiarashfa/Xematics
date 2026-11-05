import * as v from 'valibot';
import { diagnostic, hasErrors, type Diagnostic } from '../diagnostics.ts';
import { parseShorthand } from '../parse/shorthand.ts';
import { orderDiagnostics } from './shapes.ts';
import {
  AnimationSchema,
  CollapseSchema,
  LabelsSchema,
  LAYER_SCHEMAS,
  LAYER_TYPES,
  MODEL_VERSION,
  ModelSchema,
  StyleSchema,
  type Model,
} from './schema.ts';

export type ModelPath = readonly (string | number)[];
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}
/** Maps a model path (or an unknown `key` directly under it) to a position in the source text. */
export type Locator = (path: ModelPath, key?: string) => SourcePosition | undefined;

export interface ValidationResult {
  readonly model?: Model;
  readonly diagnostics: Diagnostic[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates untrusted input (already parsed from YAML/JSON, or a shorthand string) and returns the
 * canonical model. Input is accepted in a few convenient shapes: a shorthand string, a list of
 * sizes, or a full model object whose `layers` may itself be a shorthand string.
 */
export function validateModel(raw: unknown, locate: Locator = () => undefined): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  const input = normalize(raw, diagnostics, locate);
  if (hasErrors(diagnostics)) return { diagnostics };
  const result = v.safeParse(ModelSchema, input);
  if (result.success) {
    const order = orderDiagnostics(result.output).map((d) => ({ ...d, ...locate(d.path ?? []) }));
    if (order.length > 0) return { diagnostics: [...diagnostics, ...order] };
    return { model: result.output, diagnostics };
  }
  for (const issue of result.issues) diagnostics.push(...toDiagnostics(issue, locate, []));
  return { diagnostics };
}

function normalize(raw: unknown, diagnostics: Diagnostic[], locate: Locator): unknown {
  if (typeof raw === 'string') {
    return { version: MODEL_VERSION, layers: shorthandLayers(raw, [], diagnostics, locate) };
  }
  if (typeof raw === 'number') return { version: MODEL_VERSION, layers: normalizeLayers([raw]) };
  if (Array.isArray(raw)) return { version: MODEL_VERSION, layers: normalizeLayers(raw) };
  if (!isPlainObject(raw)) return raw;

  const model: Record<string, unknown> = { ...raw };
  const version = model['version'];
  if (version === undefined) model['version'] = MODEL_VERSION;
  else if (typeof version === 'number' && version > MODEL_VERSION) {
    diagnostics.push(
      diagnostic(
        'error',
        'model.newer-version',
        `This diagram uses format version ${version}, which needs a newer version of Xematics.`,
        { ...locate(['version']), path: ['version'] },
      ),
    );
    return model;
  }
  if (typeof model['layers'] === 'string') {
    model['layers'] = shorthandLayers(model['layers'], ['layers'], diagnostics, locate);
  }
  if (Array.isArray(model['layers'])) model['layers'] = normalizeLayers(model['layers']);
  return model;
}

function normalizeLayers(items: readonly unknown[]): unknown[] {
  return items.map((item) => {
    if (typeof item === 'number') return { type: 'dense', units: item };
    if (!isPlainObject(item)) return item;
    const layer: Record<string, unknown> = { type: 'dense', ...item };
    if (layer['collapse'] === true) delete layer['collapse'];
    const networks =
      layer['type'] === 'gan'
        ? ['generator', 'discriminator']
        : layer['type'] === 'autoencoder'
          ? ['encoder', 'decoder']
          : [];
    {
      // Each network is a list of sizes or layers, or a shorthand like 100-256-784:tanh.
      for (const key of networks) {
        if (layer[key] === undefined) continue;
        const network = layer[key];
        if (typeof network === 'string') {
          const parsed = parseShorthand(network);
          if (parsed.diagnostics.length === 0) layer[key] = [...parsed.layers];
        } else if (typeof network === 'number') {
          layer[key] = normalizeLayers([network]);
        } else if (Array.isArray(network)) {
          layer[key] = normalizeLayers(network);
        }
      }
    }
    return layer;
  });
}

function shorthandLayers(
  text: string,
  path: ModelPath,
  diagnostics: Diagnostic[],
  locate: Locator,
): unknown[] {
  const result = parseShorthand(text);
  const origin = locate(path);
  for (const d of result.diagnostics) {
    diagnostics.push(
      diagnostic(d.severity, d.code, d.message, {
        line: origin?.line ?? d.line,
        column: origin ? origin.column + (d.column ?? 1) - 1 : d.column,
        path,
      }),
    );
  }
  return [...result.layers];
}

type Issue = v.BaseIssue<unknown>;

function issuePath(issue: Issue): (string | number)[] {
  return (issue.path ?? []).map((item) =>
    typeof item.key === 'number' ? item.key : String(item.key),
  );
}

function toDiagnostics(issue: Issue, locate: Locator, base: ModelPath): Diagnostic[] {
  const path = [...base, ...issuePath(issue)];

  // A union like `false | { first, last }` given an object: report what is wrong inside the object.
  if (issue.type === 'union' && issue.issues && isPlainObject(issue.input)) {
    const nested = issue.issues.filter((sub) => (sub.path?.length ?? 0) > 0);
    if (nested.length > 0) return nested.flatMap((sub) => toDiagnostics(sub, locate, path));
  }

  // A required key is missing. Skip it when a misspelled key in the same object already points here.
  if (issue.type === 'strict_object' && issue.received === 'undefined' && path.length > 0) {
    const key = String(path.at(-1));
    const parent = path.slice(0, -1);
    const owner = issue.path?.at(-1)?.input;
    if (isPlainObject(owner)) {
      const known = knownKeys(parent, owner);
      const misspelled = Object.keys(owner).some(
        (k) => !known.includes(k) && closest(k, known) === key,
      );
      if (misspelled) return [];
    }
    return [
      diagnostic(
        'error',
        'model.missing-key',
        `${capitalize(describe(parent))} is missing '${key}'.`,
        {
          ...locate(parent),
          path,
        },
      ),
    ];
  }

  if (issue.type === 'strict_object' && issue.expected === 'never') {
    const key = String(path.at(-1));
    const parent = path.slice(0, -1);
    const known = knownKeys(parent, issue.path?.at(-1)?.input);
    const guess = closest(key, known);
    const message =
      `${capitalize(describe(parent))} has an unknown key '${key}'.` +
      (guess ? ` Did you mean '${guess}'?` : '') +
      (known.length > 0 ? ` Allowed keys: ${known.join(', ')}.` : '');
    return [diagnostic('error', 'model.unknown-key', message, { ...locate(parent, key), path })];
  }

  return [
    diagnostic('error', `model.${issue.type}`, `${capitalize(where(path))} ${issue.message}`, {
      ...locate(path),
      path,
    }),
  ];
}

/** Human description of a location, used as a sentence subject: "Layer 2", "'style.labels'". */
function describe(path: ModelPath): string {
  if (path.length === 0) return 'the diagram';
  if (path[0] === 'layers' && typeof path[1] === 'number') {
    const rest = path.slice(2).join('.');
    return rest ? `layer ${path[1] + 1} '${rest}'` : `layer ${path[1] + 1}`;
  }
  return `'${path.join('.')}'`;
}

function where(path: ModelPath): string {
  if (path[0] === 'layers' && typeof path[1] === 'number' && path.length > 2) {
    return `layer ${path[1] + 1}: '${path.slice(2).join('.')}'`;
  }
  return describe(path);
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function knownKeys(path: ModelPath, owner?: unknown): string[] {
  const shape = path.filter((key) => typeof key === 'string').join('.');
  if (shape === 'layers') {
    const type = isPlainObject(owner) ? owner['type'] : undefined;
    const schema = (LAYER_TYPES as readonly unknown[]).includes(type)
      ? LAYER_SCHEMAS[type as keyof typeof LAYER_SCHEMAS]
      : LAYER_SCHEMAS.dense;
    return Object.keys(schema.entries);
  }
  const schemas: Record<string, { readonly entries: object }> = {
    '': ModelSchema,
    'layers.collapse': CollapseSchema,
    style: StyleSchema,
    'style.labels': LabelsSchema,
    'style.collapse': CollapseSchema,
    animation: AnimationSchema,
  };
  const schema = schemas[shape];
  return schema ? Object.keys(schema.entries) : [];
}

/** Closest known key by edit distance, for "did you mean" hints. */
function closest(key: string, known: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Math.max(1, Math.floor(key.length / 3)) + 1;
  for (const candidate of known) {
    const distance = editDistance(key.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Edit distance where swapping two neighbouring letters counts as one edit ("frist" vs "first"). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}
