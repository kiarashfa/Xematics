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
export { autoNames, cnnAutoNames, describeCnn, opText } from './layout/cnn.ts';
export { inferShapes, pair, shapeText, type Shape, type ShapeResult } from './model/shapes.ts';
export {
  ACTIVATION_PATTERN,
  ANIMATION_LOOKS,
  ANIMATION_SCENES,
  type AnimationLook,
  type AnimationOptions,
  type AnimationScene,
  isDense,
  isMlp,
  LAYER_TYPES,
  LIMITS,
  MODEL_VERSION,
  ModelSchema,
  PADDINGS,
  POOL_MODES,
  PRESET_IDS,
  type CollapseOptions,
  type ConvLayer,
  type DenseLayer,
  type InputLayer,
  type Layer,
  type LayerType,
  type MlpModel,
  type Model,
  type Padding,
  type PoolLayer,
  type PoolMode,
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
  layerToken,
  parseShorthand,
  type ShorthandLayer,
  type ShorthandResult,
} from './parse/shorthand.ts';
export {
  labelContent,
  prepareModel,
  renderDiagram,
  renderScene,
  sceneText,
  type RenderOptions,
  type RenderResult,
} from './pipeline.ts';
export { joinMath, nodeLabelText, splitMath, type Segment } from './layout/label.ts';
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
  type MathItem,
  type TextItem,
} from './scene.ts';
export {
  PRESET_NAMES,
  PRESETS,
  resolveTheme,
  type CollapseRule,
  type Role,
  type Theme,
} from './style/theme.ts';
export {
  createTextEngine,
  type EmbeddedFace,
  type EmbeddedFonts,
  type FontFaceData,
  type FontFile,
  type FontSpec,
  type ShapedGlyph,
  type ShapedText,
  type TextEngine,
  type TextEngineOptions,
  type TextRequest,
} from './text/engine.ts';
export { CSS_FONT_STACKS } from './text/fonts.ts';
export { type MathBox, type MathResult } from './text/math.ts';
export {
  applyStructure,
  changeLayerType,
  defaultLayer,
  layerCount,
  insertLayer,
  moveLayer,
  patchLayer,
  patchAnimation,
  patchModel,
  patchStyle,
  removeLayer,
  structureOf,
  type AnimationPatch,
  type LayerPatch,
  type Patch,
  type StylePatch,
} from './edit/model.ts';
export { toJsonText, toPlain, toYaml, updateText } from './edit/text.ts';
export {
  decodeShare,
  encodeShare,
  isShareFragment,
  SHARE_PREFIX,
  SHARE_SOFT_LIMIT,
  type ShareResult,
} from './share/link.ts';
export {
  AVATAR_EMOJIS,
  createWorkspace,
  favoriteIds,
  mergeWorkspaces,
  MONO_COLORS,
  parseProfile,
  parseWorkspace,
  PROFILE_NAME_MAX,
  pruneRemoved,
  RESTORE_DAYS,
  serializeWorkspace,
  WORKSPACE_FORMAT,
  WORKSPACE_VERSION,
  type Favorite,
  type MonoColor,
  type Profile,
  type RemovedDocument,
  type Workspace,
  type WorkspaceDocument,
  type WorkspaceResult,
  type WorkspaceSettings,
} from './share/workspace.ts';
export { renderPdf } from './export/pdf.ts';
export { encodeGif, GifWriter, type GifOptions } from './export/gif.ts';
export * from './animate/index.ts';
export { renderTikz, type TikzOptions } from './export/tikz.ts';
export { embedSnippets, pngSize, setPngDpi, type EmbedSnippets } from './export/embed.ts';
