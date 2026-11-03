// Writes model edits back to the source text. The text stays the document of record: YAML keeps
// its comments and layout outside the changed parts, and shorthand stays shorthand while it can.

import { Document, isMap, isSeq, parseDocument, type Node } from 'yaml';
import type { Model } from '../model/schema.ts';
import type { InputFormat } from '../parse/parse.ts';
import { formatShorthand } from '../parse/shorthand.ts';

type Plain = null | boolean | number | string | Plain[] | { [key: string]: Plain };
type Path = (string | number)[];

const isObject = (v: unknown): v is Record<string, Plain> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The model as written by people: defaults left out, keys in reading order. */
export function toPlain(model: Model): Record<string, Plain> {
  const out: Record<string, Plain> = { version: model.version };
  if (model.title !== undefined) out['title'] = model.title;
  if (model.description !== undefined) out['description'] = model.description;
  out['layers'] = model.layers.map((layer) => {
    const { type, ...rest } = layer;
    return (type === 'dense' ? rest : layer) as Plain;
  });
  if (model.style !== undefined) out['style'] = model.style as Plain;
  return out;
}

/** Layer entries and small style objects read best on one line: `- { units: 16, name: Hidden }`. */
function flowFor(path: Path): boolean {
  return (path[0] === 'layers' && path.length === 2) || (path[0] === 'style' && path.length === 2);
}

function createNode(doc: Document, path: Path, value: Plain): Node {
  const node = doc.createNode(value) as Node;
  const mark = (n: unknown, p: Path) => {
    if (isMap(n)) {
      if (flowFor(p)) n.flow = true;
      for (const pair of n.items)
        mark(pair.value, [...p, String((pair.key as { value?: unknown })?.value)]);
    } else if (isSeq(n)) {
      n.items.forEach((item, i) => mark(item, [...p, i]));
    }
  };
  mark(node, path);
  return node;
}

export function toYaml(model: Model): string {
  const doc = new Document();
  doc.contents = createNode(doc, [], toPlain(model)) as Document['contents'];
  return doc.toString({ flowCollectionPadding: true, lineWidth: 0 });
}

export function toJsonText(model: Model): string {
  return `${JSON.stringify(toPlain(model), null, 2)}\n`;
}

function equal(a: Plain | undefined, b: Plain | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sync(doc: Document, path: Path, before: Plain | undefined, after: Plain): void {
  if (equal(before, after)) return;
  const node = path.length === 0 ? doc.contents : doc.getIn(path, true);
  if (isObject(before) && isObject(after) && isMap(node)) {
    for (const key of Object.keys(before)) if (!(key in after)) doc.deleteIn([...path, key]);
    for (const [key, value] of Object.entries(after)) {
      if (key in before) sync(doc, [...path, key], before[key], value);
      else doc.setIn([...path, key], createNode(doc, [...path, key], value));
    }
    return;
  }
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    isSeq(node) &&
    before.length === after.length
  ) {
    after.forEach((value, i) => sync(doc, [...path, i], before[i], value));
    return;
  }
  if (path.length === 0) doc.contents = createNode(doc, path, after) as Document['contents'];
  else doc.setIn(path, createNode(doc, path, after));
}

/**
 * Returns new source text for `after`, given the text that produced `before`.
 * Shorthand stays shorthand when it can express the result, and becomes YAML otherwise.
 */
export function updateText(
  text: string,
  format: InputFormat,
  before: Model,
  after: Model,
): { text: string; format: InputFormat } {
  if (format === 'shorthand') {
    const shorthand = formatShorthand(after);
    return shorthand === undefined
      ? { text: toYaml(after), format: 'yaml' }
      : { text: shorthand, format };
  }
  if (format === 'json') return { text: toJsonText(after), format };
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return { text: toYaml(after), format: 'yaml' };
  sync(doc, [], toPlain(before), toPlain(after));
  return { text: doc.toString({ flowCollectionPadding: true, lineWidth: 0 }), format };
}
