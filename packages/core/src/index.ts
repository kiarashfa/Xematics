export {
  diagnostic,
  formatDiagnostic,
  hasErrors,
  type Diagnostic,
  type DiagnosticLocation,
} from './diagnostics.ts';
export {
  autoName,
  describe,
  layoutModel,
  MAX_DRAWN_NEURONS,
  roleOf,
  type LayoutResult,
} from './layout/mlp.ts';
export {
  ACTIVATION_PATTERN,
  LAYER_TYPES,
  LIMITS,
  MODEL_VERSION,
  ModelSchema,
  PRESET_IDS,
  type CollapseOptions,
  type Layer,
  type Model,
  type PresetId,
  type StyleOptions,
} from './model/schema.ts';
export {
  validateModel,
  type Locator,
  type ModelPath,
  type SourcePosition,
  type ValidationResult,
} from './model/validate.ts';
export { detectFormat, parseModel, type InputFormat, type ParseResult } from './parse/parse.ts';
export {
  formatShorthand,
  parseShorthand,
  type ShorthandLayer,
  type ShorthandResult,
} from './parse/shorthand.ts';
export { renderDiagram, type RenderResult } from './pipeline.ts';
export { renderSvg, type SvgOptions } from './render/svg.ts';
export {
  SCENE_VERSION,
  type CircleItem,
  type GroupItem,
  type LineItem,
  type Paint,
  type PathItem,
  type RectItem,
  type Scene,
  type SceneItem,
  type TextItem,
} from './scene.ts';
export { PRESETS, resolveTheme, type CollapseRule, type Role, type Theme } from './style/theme.ts';
export {
  createTextEngine,
  type FontFaceData,
  type FontSpec,
  type ShapedGlyph,
  type ShapedText,
  type TextEngine,
} from './text/engine.ts';
export { BUNDLED_FONTS, CSS_FONT_STACKS, FONT_PACKAGE, type BundledFont } from './text/fonts.ts';
