// Canonical diagram model (format version 1). This is a public, shareable contract:
// share links and saved files depend on it, so changes must stay backward compatible.

import * as v from 'valibot';

export const MODEL_VERSION = 1;

export const LIMITS = {
  inputChars: 200_000,
  layers: 256,
  units: 1_000_000,
  collapseKeep: 100,
  label: 200,
  title: 300,
  description: 2000,
  activation: 40,
  /** Height and width of an image or feature map. */
  side: 100_000,
  channels: 100_000,
  window: 1000,
} as const;

export const PRESET_IDS = ['classic', 'boxes', 'mono', 'colorblind', 'colorblind-dark'] as const;
export const LAYER_TYPES = ['dense', 'input', 'conv', 'pool', 'gap', 'flatten'] as const;
export const PADDINGS = ['same', 'valid'] as const;
export const POOL_MODES = ['max', 'avg'] as const;
export const DIRECTIONS = ['ltr', 'rtl'] as const;

/** Activation names are identifiers so they stay valid in the shorthand: relu, leaky_relu, softmax. */
export const ACTIVATION_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Messages are predicates; validation prefixes them with where the problem is ("Layer 2: 'units' ...").
function wholeNumber(min: number, max: number) {
  return v.pipe(
    v.number('must be a number.'),
    v.integer('must be a whole number.'),
    v.minValue(min, `must be at least ${min}.`),
    v.maxValue(max, `must be at most ${max}.`),
  );
}

function decimal(min: number, max: number) {
  return v.pipe(
    v.number('must be a number.'),
    v.finite('must be a finite number.'),
    v.minValue(min, `must be at least ${min}.`),
    v.maxValue(max, `must be at most ${max}.`),
  );
}

function text(max: number) {
  return v.pipe(
    v.string('must be text.'),
    v.maxLength(max, `must be at most ${max} characters long.`),
  );
}

const flag = () => v.boolean('must be true or false.');

/** Collapse rule: layers with more than `above` neurons show the `first` and `last` ones around an ellipsis. */
export const CollapseSchema = v.strictObject(
  {
    above: v.optional(wholeNumber(1, LIMITS.units)),
    first: v.optional(wholeNumber(0, LIMITS.collapseKeep)),
    last: v.optional(wholeNumber(0, LIMITS.collapseKeep)),
  },
  'must be an object like { above: 10, first: 3, last: 3 }.',
);

const name = () => v.optional(text(LIMITS.label));
const activation = () =>
  v.optional(
    v.pipe(
      text(LIMITS.activation),
      v.regex(ACTIVATION_PATTERN, 'must be a simple name like relu, tanh or softmax.'),
    ),
  );
/** A window size or stride: one number for a square, or [height, width]. */
const windowSize = () =>
  v.union(
    [
      wholeNumber(1, LIMITS.window),
      v.strictTuple([wholeNumber(1, LIMITS.window), wholeNumber(1, LIMITS.window)]),
    ],
    `must be a whole number from 1 to ${LIMITS.window}, or [height, width].`,
  );

export const DenseLayerSchema = v.strictObject(
  {
    type: v.literal('dense'),
    units: wholeNumber(1, LIMITS.units),
    name: name(),
    /** Label drawn inside every node; `{i}` is the neuron number, e.g. '$x_{i}$'. */
    nodeLabel: v.optional(text(LIMITS.label)),
    activation: activation(),
    collapse: v.optional(
      v.union(
        [v.literal(false), CollapseSchema],
        'must be false or an object like { first: 3, last: 3 }.',
      ),
    ),
  },
  'must be a number or an object like { units: 16 }.',
);

/** An image: [height, width] or [height, width, channels]. */
export const InputLayerSchema = v.strictObject(
  {
    type: v.literal('input'),
    shape: v.union(
      [
        v.strictTuple([wholeNumber(1, LIMITS.side), wholeNumber(1, LIMITS.side)]),
        v.strictTuple([
          wholeNumber(1, LIMITS.side),
          wholeNumber(1, LIMITS.side),
          wholeNumber(1, LIMITS.channels),
        ]),
      ],
      'must be [height, width] or [height, width, channels], like [28, 28, 1].',
    ),
    name: name(),
  },
  'must be an object like { type: input, shape: [28, 28, 1] }.',
);

export const ConvLayerSchema = v.strictObject(
  {
    type: v.literal('conv'),
    filters: wholeNumber(1, LIMITS.channels),
    kernel: windowSize(),
    stride: v.optional(windowSize()),
    padding: v.optional(v.picklist(PADDINGS, `must be one of: ${PADDINGS.join(', ')}.`)),
    name: name(),
    activation: activation(),
  },
  'must be an object like { type: conv, filters: 16, kernel: 3 }.',
);

export const PoolLayerSchema = v.strictObject(
  {
    type: v.literal('pool'),
    size: windowSize(),
    stride: v.optional(windowSize()),
    padding: v.optional(v.picklist(PADDINGS, `must be one of: ${PADDINGS.join(', ')}.`)),
    mode: v.optional(v.picklist(POOL_MODES, `must be one of: ${POOL_MODES.join(', ')}.`)),
    name: name(),
  },
  'must be an object like { type: pool, size: 2 }.',
);

/** Global average pooling: a feature map becomes one value per channel. */
export const GapLayerSchema = v.strictObject(
  { type: v.literal('gap'), name: name() },
  'must be an object like { type: gap }.',
);

export const FlattenLayerSchema = v.strictObject(
  { type: v.literal('flatten'), name: name() },
  'must be an object like { type: flatten }.',
);

export const LAYER_SCHEMAS = {
  dense: DenseLayerSchema,
  input: InputLayerSchema,
  conv: ConvLayerSchema,
  pool: PoolLayerSchema,
  gap: GapLayerSchema,
  flatten: FlattenLayerSchema,
} as const;

export const LayerSchema = v.variant(
  'type',
  [
    DenseLayerSchema,
    InputLayerSchema,
    ConvLayerSchema,
    PoolLayerSchema,
    GapLayerSchema,
    FlattenLayerSchema,
  ],
  (issue) =>
    issue.received === 'undefined' || !issue.path?.length || issue.path.at(-1)?.key !== 'type'
      ? 'must be a number or an object like { units: 16 }.'
      : `'${String(issue.input)}' is not a layer type. Layer types: ${LAYER_TYPES.join(', ')}.`,
);

export const LabelsSchema = v.strictObject(
  { names: v.optional(flag()), sizes: v.optional(flag()), ops: v.optional(flag()) },
  'must be an object like { names: true, sizes: false }.',
);

const BACKGROUND_MESSAGE = "must be 'transparent' or a quoted hex color like '#ffffff'.";

export const StyleSchema = v.strictObject(
  {
    preset: v.optional(v.picklist(PRESET_IDS, `must be one of: ${PRESET_IDS.join(', ')}.`)),
    background: v.optional(
      v.union(
        [v.literal('transparent'), v.pipe(v.string(), v.regex(HEX_COLOR, BACKGROUND_MESSAGE))],
        BACKGROUND_MESSAGE,
      ),
    ),
    labels: v.optional(LabelsSchema),
    collapse: v.optional(CollapseSchema),
    nodeRadius: v.optional(decimal(2, 100)),
    nodeSpacing: v.optional(decimal(0, 200)),
    layerSpacing: v.optional(decimal(20, 2000)),
    /** Flow direction: 'rtl' puts the input layer on the right. */
    direction: v.optional(v.picklist(DIRECTIONS, `must be one of: ${DIRECTIONS.join(', ')}.`)),
  },
  'must be an object like { preset: classic }.',
);

export const ModelSchema = v.strictObject(
  {
    version: v.literal(MODEL_VERSION, `must be ${MODEL_VERSION}.`),
    title: v.optional(text(LIMITS.title)),
    description: v.optional(text(LIMITS.description)),
    layers: v.pipe(
      v.array(LayerSchema, 'must be a list of layers.'),
      v.minLength(1, 'must contain at least one layer.'),
      v.maxLength(LIMITS.layers, `must contain at most ${LIMITS.layers} layers.`),
    ),
    style: v.optional(StyleSchema),
  },
  'must be a shorthand like 784-16-10, a list of layer sizes, or an object with a layers list.',
);

export type Model = v.InferOutput<typeof ModelSchema>;
export type Layer = Model['layers'][number];
export type LayerType = Layer['type'];
export type DenseLayer = Extract<Layer, { type: 'dense' }>;
export type InputLayer = Extract<Layer, { type: 'input' }>;
export type ConvLayer = Extract<Layer, { type: 'conv' }>;
export type PoolLayer = Extract<Layer, { type: 'pool' }>;
export type Padding = (typeof PADDINGS)[number];
export type PoolMode = (typeof POOL_MODES)[number];

export const isDense = (layer: Layer): layer is DenseLayer => layer.type === 'dense';
/** A model whose layers are all dense (a plain fully connected network). */
export type MlpModel = Omit<Model, 'layers'> & { readonly layers: readonly DenseLayer[] };
/** True when every layer is dense: the model is drawn as a plain fully connected network. */
export const isMlp = (model: Model): model is Model & MlpModel => model.layers.every(isDense);
export type StyleOptions = v.InferOutput<typeof StyleSchema>;
export type CollapseOptions = v.InferOutput<typeof CollapseSchema>;
export type PresetId = (typeof PRESET_IDS)[number];
