import type { Diagnostic } from './diagnostics.ts';
import { layoutModel } from './layout/mlp.ts';
import type { Model } from './model/schema.ts';
import { parseModel, type InputFormat } from './parse/parse.ts';
import { renderSvg, type SvgOptions } from './render/svg.ts';
import type { Scene } from './scene.ts';
import type { TextEngine } from './text/engine.ts';

export interface RenderResult {
  readonly svg?: string;
  readonly model?: Model;
  readonly scene?: Scene;
  readonly format: InputFormat;
  readonly diagnostics: readonly Diagnostic[];
}

/** Text in, SVG out: parse, validate, lay out and render in one call. */
export function renderDiagram(
  text: string,
  engine: TextEngine,
  options: SvgOptions = {},
): RenderResult {
  const parsed = parseModel(text);
  if (!parsed.model) return { format: parsed.format, diagnostics: parsed.diagnostics };
  const layout = layoutModel(parsed.model, engine);
  return {
    svg: renderSvg(layout.scene, options),
    model: parsed.model,
    scene: layout.scene,
    format: parsed.format,
    diagnostics: [...parsed.diagnostics, ...layout.diagnostics],
  };
}
