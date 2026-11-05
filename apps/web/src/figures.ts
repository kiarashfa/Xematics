// Build-time figures for the site pages: rendered by the same engine as the editor and the CLI.

import { encodeShare, isMlp, parseModel, renderDiagram, type TextEngine } from '@xematics/core';
import { createNodeTextEngine } from '@xematics/core/node';

let engine: Promise<TextEngine> | undefined;

/** The figure as an outlined SVG; `prefix` keeps ids unique on a page with several figures. */
export async function figure(source: string, prefix: string): Promise<string> {
  engine ??= createNodeTextEngine();
  const result = await renderDiagram(source, await engine, { prefix });
  if (!result.svg) {
    throw new Error(`Site figure ${prefix} does not render: ${result.diagnostics[0]?.message}`);
  }
  return result.svg;
}

/** A link that opens the source in the editor (a share link, so it works offline too). */
export async function editorLink(source: string): Promise<string> {
  return `${import.meta.env.BASE_URL}tool/#${await encodeShare(source)}`;
}

/** The shorthand line, or a short description for YAML sources. */
export function sourceSummary(source: string): string {
  if (!source.includes('\n')) return source;
  const model = parseModel(source).model;
  if (model && !isMlp(model)) return `CNN, ${model.layers.length} layers`;
  const layers = /layers:\s*\[([^\]]*)\]/.exec(source)?.[1];
  if (layers)
    return layers
      .split(',')
      .map((n) => n.trim())
      .join('-');
  const count = source.split('\n').filter((line) => /^\s+- /.test(line)).length;
  return `YAML, ${count} layers`;
}
