import type { Diagnostic } from './diagnostics.ts';
import { splitMath, nodeLabelText } from './layout/label.ts';
import { cnnLabels } from './layout/cnn.ts';
import { cleanLabel, layoutModel, nameText, slotsOf } from './layout/mlp.ts';
import { isMlp, type MlpModel, type Model } from './model/schema.ts';
import { parseModelAsync, type InputFormat } from './parse/parse.ts';
import { renderSvg, type SvgOptions } from './render/svg.ts';
import type { Scene } from './scene.ts';
import { resolveTheme, type TextStyle } from './style/theme.ts';
import type { TextEngine, TextRequest } from './text/engine.ts';

export interface RenderResult {
  readonly svg?: string;
  readonly model?: Model;
  readonly scene?: Scene;
  readonly format: InputFormat;
  readonly diagnostics: readonly Diagnostic[];
}

export interface RenderOptions extends SvgOptions {
  /** With live text, embed subsets of the fonts used so the SVG looks the same everywhere. Default true. */
  readonly embedFonts?: boolean;
}

/** Every text run and formula a model's labels contain, so fonts and math can load first. */
export function labelContent(model: Model): { text: TextRequest[]; math: string[] } {
  const theme = resolveTheme(model.style);
  const count = model.layers.length;
  const text: TextRequest[] = [];
  const math: string[] = [];
  const add = (label: string, style: TextStyle) => {
    for (const segment of splitMath(label)) {
      if (segment.kind === 'text') text.push({ text: segment.text, font: style });
      else {
        math.push(segment.tex);
        // Shown as source when the formula is invalid.
        text.push({ text: `$${segment.tex}$`, font: style });
      }
    }
  };
  if (!isMlp(model)) {
    for (const label of cnnLabels(model, theme)) add(label.text, label.style);
    if (theme.mode === 'nodes') {
      const style = { ...theme.nodeText, color: '' };
      for (const layer of model.layers) {
        if (layer.type !== 'dense' || layer.nodeLabel === undefined) continue;
        const template = cleanLabel(layer.nodeLabel);
        if (!template) continue;
        for (const slot of slotsOf(layer, theme).slots) {
          if (slot !== 'ellipsis') add(nodeLabelText(template, slot + 1), style);
        }
      }
    }
    return { text, math };
  }
  const mlp: MlpModel = model;
  mlp.layers.forEach((layer, index) => {
    const name = nameText(layer, index, count);
    if (theme.labels.names && name) add(name, theme.nameText);
    text.push({ text: String(layer.units), font: theme.sizeText });
    const template = layer.nodeLabel === undefined ? '' : cleanLabel(layer.nodeLabel);
    if (template && theme.mode === 'nodes') {
      const style = { ...theme.nodeText, color: '' };
      for (const slot of slotsOf(layer, theme).slots) {
        if (slot !== 'ellipsis') add(nodeLabelText(template, slot + 1), style);
      }
    }
  });
  return { text, math };
}

/** Loads the fonts and formulas a model needs. Resolves true when anything new was loaded. */
export async function prepareModel(model: Model, engine: TextEngine): Promise<boolean> {
  const { text, math } = labelContent(model);
  const [fonts, formulas] = await Promise.all([
    engine.load(text),
    math.length > 0 ? engine.loadMath(math) : Promise.resolve(false),
  ]);
  return fonts || formulas;
}

/** Text requests for the live text in a scene, for font embedding. */
export function sceneText(scene: Scene): TextRequest[] {
  return scene.items.flatMap((item) =>
    item.kind === 'text' ? [{ text: item.text, font: item.font }] : [],
  );
}

/** Renders a laid-out scene, embedding fonts when the text stays live. */
export async function renderScene(
  scene: Scene,
  engine: TextEngine,
  options: RenderOptions = {},
): Promise<string> {
  const embed = options.text === 'live' && options.embedFonts !== false;
  const fonts = embed ? await engine.embed(sceneText(scene)) : undefined;
  return renderSvg(scene, { ...options, ...(fonts ? { fonts } : {}) });
}

/** Text in, SVG out: parse, validate, load fonts and math, lay out and render. */
export async function renderDiagram(
  text: string,
  engine: TextEngine,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const parsed = await parseModelAsync(text);
  if (!parsed.model) return { format: parsed.format, diagnostics: parsed.diagnostics };
  await prepareModel(parsed.model, engine);
  const layout = layoutModel(parsed.model, engine);
  return {
    svg: await renderScene(layout.scene, engine, options),
    model: parsed.model,
    scene: layout.scene,
    format: parsed.format,
    diagnostics: [...parsed.diagnostics, ...layout.diagnostics],
  };
}
