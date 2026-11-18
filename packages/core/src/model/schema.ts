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
  /** Time steps of a sequence, tokens in a text. */
  steps: 100_000,
  /** Transformer blocks and attention heads. */
  blocks: 1000,
  heads: 1000,
  /** Time steps an unrolled recurrent diagram draws. */
  drawnSteps: 12,
  /** Layers inside each network of a GAN. */
  ganLayers: 64,
} as const;

export const PRESET_IDS = ['classic', 'boxes', 'mono', 'colorblind', 'colorblind-dark'] as const;
export const LAYER_TYPES = [
  'dense',
  'input',
  'conv',
  'pool',
  'deconv',
  'up',
  'reshape',
  'gap',
  'flatten',
  'sequence',
  'rnn',
  'lstm',
  'gru',
  'tokens',
  'embed',
  'encoder',
  'decoder',
  'gan',
  'autoencoder',
] as const;
/** Recurrent layer types (one cell per time step). */
export const RECURRENT_TYPES = ['rnn', 'lstm', 'gru'] as const;
/** How recurrent networks are drawn: one cell per step, or each step as a small network of neurons. */
export const RECURRENT_LOOKS = ['unrolled', 'neurons'] as const;
/** How a GAN's networks are drawn inside their funnels. */
export const FUNNEL_LOOKS = ['neurons', 'plain'] as const;
export const PADDINGS = ['same', 'valid'] as const;
export const POOL_MODES = ['max', 'avg'] as const;
/** How a skip connection joins: added to the layer's output (ResNet) or stacked onto it (U-Net). */
export const SKIP_OPS = ['add', 'concat'] as const;
export const DIRECTIONS = ['ltr', 'rtl'] as const;
/** Animation looks: a signal (pulse, flow, dots), the network learning, or a whole training loop. */
export const ANIMATION_LOOKS = ['pulse', 'flow', 'dots', 'learning', 'training'] as const;
/** Which way the signal looks (pulse, flow, dots) run. */
export const ANIMATION_SCENES = ['forward', 'backward', 'both'] as const;
/** Outline patterns for a layer kind's nodes. */
export const DASH_STYLES = ['solid', 'dashed', 'dotted', 'dash-dot'] as const;
/** Layer kinds whose colors a style can set. */
export const ROLES = ['input', 'hidden', 'output'] as const;

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

const COLOR_MESSAGE = "must be a quoted hex color like '#1f77b4'.";
const color = () => v.pipe(v.string(COLOR_MESSAGE), v.regex(HEX_COLOR, COLOR_MESSAGE));

/** Fill and outline of one layer kind (input, hidden or output); unset parts keep the preset's. */
export const RoleStyleSchema = v.strictObject(
  {
    fill: v.optional(color()),
    outline: v.optional(color()),
    /** Outline width in px for plain neurons (other shapes scale with it); 0 hides the outline. */
    weight: v.optional(decimal(0, 20)),
    dashes: v.optional(v.picklist(DASH_STYLES, `must be one of: ${DASH_STYLES.join(', ')}.`)),
  },
  "must be an object like { fill: '#d4e8f5', outline: '#0072b2' }.",
);

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

/** A skip connection: an earlier layer's output (by its number, from 1) joins this layer's output. */
const skip = () =>
  v.optional(
    v.strictObject(
      {
        from: wholeNumber(1, LIMITS.layers),
        op: v.optional(v.picklist(SKIP_OPS, `must be one of: ${SKIP_OPS.join(', ')}.`)),
      },
      'must be an object like { from: 2 } or { from: 2, op: concat }.',
    ),
  );

export const DenseLayerSchema = v.strictObject(
  {
    type: v.literal('dense'),
    units: wholeNumber(1, LIMITS.units),
    name: name(),
    skip: skip(),
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

const DRAWN_SHAPE = /^\s*(\d{1,5})\s*[x×]\s*(\d{1,5})(?:\s*[x×]\s*(\d{1,5}))?\s*$/;
const DRAWN_SHAPE_MESSAGE = 'must be a size like 26x26x8 (height x width x channels) or 26x26.';

/** Reads a drawn-size override like '26x26x8' or '26x26'; undefined when it is not one. */
export function parseDrawnShape(
  text: string,
): { readonly h: number; readonly w: number; readonly c?: number } | undefined {
  const m = DRAWN_SHAPE.exec(text);
  if (!m) return undefined;
  const [h, w, c] = [Number(m[1]), Number(m[2]), m[3] === undefined ? undefined : Number(m[3])];
  if (h < 1 || w < 1 || h > LIMITS.side || w > LIMITS.side) return undefined;
  if (c !== undefined && (c < 1 || c > LIMITS.channels)) return undefined;
  return c === undefined ? { h, w } : { h, w, c };
}

/** The size a map layer is drawn at, when its computed size is not what the figure should show. */
const drawnShape = () =>
  v.optional(
    v.pipe(
      v.string(DRAWN_SHAPE_MESSAGE),
      v.check((value) => parseDrawnShape(value) !== undefined, DRAWN_SHAPE_MESSAGE),
    ),
  );

export const ConvLayerSchema = v.strictObject(
  {
    type: v.literal('conv'),
    filters: wholeNumber(1, LIMITS.channels),
    kernel: windowSize(),
    stride: v.optional(windowSize()),
    padding: v.optional(v.picklist(PADDINGS, `must be one of: ${PADDINGS.join(', ')}.`)),
    shape: drawnShape(),
    skip: skip(),
    name: name(),
    activation: activation(),
  },
  'must be an object like { type: conv, filters: 16, kernel: 3 }.',
);

/** Transposed convolution: the map grows by the stride (U-Net decoders, DCGAN generators). */
export const DeconvLayerSchema = v.strictObject(
  {
    type: v.literal('deconv'),
    filters: wholeNumber(1, LIMITS.channels),
    kernel: windowSize(),
    stride: v.optional(windowSize()),
    padding: v.optional(v.picklist(PADDINGS, `must be one of: ${PADDINGS.join(', ')}.`)),
    shape: drawnShape(),
    skip: skip(),
    name: name(),
    activation: activation(),
  },
  'must be an object like { type: deconv, filters: 64, kernel: 4, stride: 2 }.',
);

/** Upsampling: every value repeats over a size × size block, so the map grows; nothing to learn. */
export const UpLayerSchema = v.strictObject(
  {
    type: v.literal('up'),
    size: windowSize(),
    shape: drawnShape(),
    skip: skip(),
    name: name(),
  },
  'must be an object like { type: up, size: 2 }.',
);

/** Reshape: a flat vector becomes a feature map of the given size (a DCGAN generator's start). */
export const ReshapeLayerSchema = v.strictObject(
  {
    type: v.literal('reshape'),
    shape: v.union(
      [
        v.strictTuple([wholeNumber(1, LIMITS.side), wholeNumber(1, LIMITS.side)]),
        v.strictTuple([
          wholeNumber(1, LIMITS.side),
          wholeNumber(1, LIMITS.side),
          wholeNumber(1, LIMITS.channels),
        ]),
      ],
      'must be [height, width] or [height, width, channels], like [4, 4, 512].',
    ),
    name: name(),
  },
  'must be an object like { type: reshape, shape: [4, 4, 512] }.',
);

export const PoolLayerSchema = v.strictObject(
  {
    type: v.literal('pool'),
    size: windowSize(),
    stride: v.optional(windowSize()),
    padding: v.optional(v.picklist(PADDINGS, `must be one of: ${PADDINGS.join(', ')}.`)),
    mode: v.optional(v.picklist(POOL_MODES, `must be one of: ${POOL_MODES.join(', ')}.`)),
    shape: drawnShape(),
    skip: skip(),
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

/** A sequence input: steps × features (a sentence of word vectors, a time series). */
export const SequenceLayerSchema = v.strictObject(
  {
    type: v.literal('sequence'),
    steps: wholeNumber(1, LIMITS.steps),
    features: wholeNumber(1, LIMITS.units),
    name: name(),
  },
  'must be an object like { type: sequence, steps: 20, features: 32 }.',
);

function recurrentSchema<T extends (typeof RECURRENT_TYPES)[number]>(type: T) {
  return v.strictObject(
    {
      type: v.literal(type),
      units: wholeNumber(1, LIMITS.units),
      /** Reads the sequence both ways; the output joins both directions. */
      bidirectional: v.optional(flag()),
      /** Only the last step's output goes on (many to one). */
      last: v.optional(flag()),
      name: name(),
      activation: activation(),
    },
    `must be an object like { type: ${type}, units: 64 }.`,
  );
}
export const RnnLayerSchema = recurrentSchema('rnn');
export const LstmLayerSchema = recurrentSchema('lstm');
export const GruLayerSchema = recurrentSchema('gru');

/** Text as a sequence of token ids. */
export const TokensLayerSchema = v.strictObject(
  { type: v.literal('tokens'), length: wholeNumber(1, LIMITS.steps), name: name() },
  'must be an object like { type: tokens, length: 512 }.',
);

/** Token embedding (with positional encoding): every token becomes a vector of `width` numbers. */
export const EmbedLayerSchema = v.strictObject(
  { type: v.literal('embed'), width: wholeNumber(1, LIMITS.units), name: name() },
  'must be an object like { type: embed, width: 512 }.',
);

function blockSchema<T extends 'encoder' | 'decoder'>(type: T) {
  return v.strictObject(
    {
      type: v.literal(type),
      blocks: wholeNumber(1, LIMITS.blocks),
      heads: wholeNumber(1, LIMITS.heads),
      /** Width of the feed-forward layer inside each block (default 4 × the model width). */
      ff: v.optional(wholeNumber(1, LIMITS.units)),
      name: name(),
    },
    `must be an object like { type: ${type}, blocks: 6, heads: 8 }.`,
  );
}
export const EncoderLayerSchema = blockSchema('encoder');
export const DecoderLayerSchema = blockSchema('decoder');

const ganNetwork = (example: string) =>
  v.pipe(
    v.array(DenseLayerSchema, `must be a list of layer sizes, like ${example}.`),
    v.minLength(2, 'must have at least two layers.'),
    v.maxLength(LIMITS.ganLayers, `must have at most ${LIMITS.ganLayers} layers.`),
  );

/** A generative adversarial network: a generator and a discriminator, both fully connected. */
export const GanLayerSchema = v.strictObject(
  {
    type: v.literal('gan'),
    generator: ganNetwork('[100, 256, 784]'),
    discriminator: ganNetwork('[784, 256, 1]'),
    name: name(),
  },
  'must be an object like { type: gan, generator: [100, 256, 784], discriminator: [784, 256, 1] }.',
);

/** An autoencoder: the encoder narrows to the latent space, the decoder (a mirror by default) widens out. */
export const AutoencoderLayerSchema = v.strictObject(
  {
    type: v.literal('autoencoder'),
    encoder: ganNetwork('[784, 256, 32]'),
    decoder: v.optional(ganNetwork('[32, 256, 784]')),
    /** Variational: the encoder gives a mean and a spread, and the latent is sampled from them. */
    vae: v.optional(flag()),
    name: name(),
  },
  'must be an object like { type: autoencoder, encoder: [784, 256, 32] }.',
);

export const LAYER_SCHEMAS = {
  dense: DenseLayerSchema,
  input: InputLayerSchema,
  conv: ConvLayerSchema,
  pool: PoolLayerSchema,
  deconv: DeconvLayerSchema,
  up: UpLayerSchema,
  reshape: ReshapeLayerSchema,
  gap: GapLayerSchema,
  flatten: FlattenLayerSchema,
  sequence: SequenceLayerSchema,
  rnn: RnnLayerSchema,
  lstm: LstmLayerSchema,
  gru: GruLayerSchema,
  tokens: TokensLayerSchema,
  embed: EmbedLayerSchema,
  encoder: EncoderLayerSchema,
  decoder: DecoderLayerSchema,
  gan: GanLayerSchema,
  autoencoder: AutoencoderLayerSchema,
} as const;

export const LayerSchema = v.variant(
  'type',
  [
    DenseLayerSchema,
    InputLayerSchema,
    ConvLayerSchema,
    PoolLayerSchema,
    DeconvLayerSchema,
    UpLayerSchema,
    ReshapeLayerSchema,
    GapLayerSchema,
    FlattenLayerSchema,
    SequenceLayerSchema,
    RnnLayerSchema,
    LstmLayerSchema,
    GruLayerSchema,
    TokensLayerSchema,
    EmbedLayerSchema,
    EncoderLayerSchema,
    DecoderLayerSchema,
    GanLayerSchema,
    AutoencoderLayerSchema,
  ],
  (issue) =>
    issue.received === 'undefined' || !issue.path?.length || issue.path.at(-1)?.key !== 'type'
      ? 'must be a number or an object like { units: 16 }.'
      : `'${String(issue.input)}' is not a layer type. Layer types: ${LAYER_TYPES.join(', ')}.`,
);

export const LabelsSchema = v.strictObject(
  {
    names: v.optional(flag()),
    sizes: v.optional(flag()),
    ops: v.optional(flag()),
    /** Trainable parameters (weights and biases) under each layer's labels. */
    params: v.optional(flag()),
  },
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
    /** Color connections by a learned weight (sign and strength), the still frame of 'learning'. */
    weights: v.optional(flag()),
    /** Recurrent networks: one cell per time step, or each step as a small network of neurons. */
    recurrent: v.optional(
      v.picklist(RECURRENT_LOOKS, `must be one of: ${RECURRENT_LOOKS.join(', ')}.`),
    ),
    /** Time steps drawn when a sequence is longer (the last one is drawn after an ellipsis). */
    steps: v.optional(wholeNumber(2, LIMITS.drawnSteps)),
    /** Draw the gates inside one recurrent cell instead of the whole network. */
    cell: v.optional(flag()),
    /** GANs: draw each network's neurons inside its funnel, or only its name. */
    funnel: v.optional(v.picklist(FUNNEL_LOOKS, `must be one of: ${FUNNEL_LOOKS.join(', ')}.`)),
    /** Draw a fully connected network as an autoencoder: funnels meeting at its smallest layer. */
    autoencoder: v.optional(flag()),
    /** Colors and outlines of the input, hidden and output layers, over the preset's. */
    input: v.optional(RoleStyleSchema),
    hidden: v.optional(RoleStyleSchema),
    output: v.optional(RoleStyleSchema),
  },
  'must be an object like { preset: classic }.',
);

export const AnimationSchema = v.strictObject(
  {
    look: v.optional(v.picklist(ANIMATION_LOOKS, `must be one of: ${ANIMATION_LOOKS.join(', ')}.`)),
    scene: v.optional(
      v.picklist(ANIMATION_SCENES, `must be one of: ${ANIMATION_SCENES.join(', ')}.`),
    ),
    speed: v.optional(decimal(0.25, 4)),
    loop: v.optional(flag()),
    /** Hidden layers keep their fill and only get a darker border when the flow reaches them. */
    grayHidden: v.optional(flag()),
    /** Colors of the forward signal and the backward error (default: the preset's). */
    forward: v.optional(color()),
    backward: v.optional(color()),
  },
  'must be an object like { look: pulse, scene: both }.',
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
    animation: v.optional(AnimationSchema),
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
export type DeconvLayer = Extract<Layer, { type: 'deconv' }>;
export type UpLayer = Extract<Layer, { type: 'up' }>;
export type ReshapeLayer = Extract<Layer, { type: 'reshape' }>;
/** Layers that can take a skip connection. */
export type SkipLayer = Extract<Layer, { skip?: unknown }>;
export type SkipOp = (typeof SKIP_OPS)[number];
export type SequenceLayer = Extract<Layer, { type: 'sequence' }>;
export type RecurrentType = (typeof RECURRENT_TYPES)[number];
export type RecurrentLayer = Extract<Layer, { type: RecurrentType }>;
export type TokensLayer = Extract<Layer, { type: 'tokens' }>;
export type EmbedLayer = Extract<Layer, { type: 'embed' }>;
export type BlockLayer = Extract<Layer, { type: 'encoder' | 'decoder' }>;
export type GanLayer = Extract<Layer, { type: 'gan' }>;
export type AutoencoderLayer = Extract<Layer, { type: 'autoencoder' }>;
export type RecurrentLook = (typeof RECURRENT_LOOKS)[number];
export type FunnelLook = (typeof FUNNEL_LOOKS)[number];
export type DashStyle = (typeof DASH_STYLES)[number];
export type RoleStyle = v.InferOutput<typeof RoleStyleSchema>;
export type Padding = (typeof PADDINGS)[number];
export type PoolMode = (typeof POOL_MODES)[number];

export const isDense = (layer: Layer): layer is DenseLayer => layer.type === 'dense';
/** A model whose layers are all dense (a plain fully connected network). */
export type MlpModel = Omit<Model, 'layers'> & { readonly layers: readonly DenseLayer[] };
/** True when every layer is dense: the model is drawn as a plain fully connected network. */
/** A plain fully connected network: dense layers only, without skip connections. */
export const isMlp = (model: Model): model is Model & MlpModel =>
  model.layers.every((l) => isDense(l) && l.skip === undefined);

/** The skip of a layer, if it has one (with the default operation filled in). */
export function skipOf(layer: Layer): { from: number; op: SkipOp } | undefined {
  if (!('skip' in layer) || layer.skip === undefined) return undefined;
  return { from: layer.skip.from, op: layer.skip.op ?? 'add' };
}
export const isRecurrent = (layer: Layer): layer is RecurrentLayer =>
  (RECURRENT_TYPES as readonly string[]).includes(layer.type);

/** Which layout draws a model. */
export type Family = 'mlp' | 'cnn' | 'rnn' | 'transformer' | 'gan' | 'autoencoder';

export function familyOf(model: Pick<Model, 'layers'>): Family {
  const types = new Set(model.layers.map((l) => l.type));
  if (types.has('gan')) return 'gan';
  if (types.has('autoencoder')) return 'autoencoder';
  if (types.has('encoder') || types.has('decoder')) return 'transformer';
  if (model.layers.some(isRecurrent) || types.has('sequence')) return 'rnn';
  if (types.has('tokens') || types.has('embed')) return 'transformer';
  return model.layers.every((l) => isDense(l) && l.skip === undefined) ? 'mlp' : 'cnn';
}
export type StyleOptions = v.InferOutput<typeof StyleSchema>;
export type AnimationOptions = v.InferOutput<typeof AnimationSchema>;
export type AnimationLook = (typeof ANIMATION_LOOKS)[number];
export type AnimationScene = (typeof ANIMATION_SCENES)[number];
export type CollapseOptions = v.InferOutput<typeof CollapseSchema>;
export type PresetId = (typeof PRESET_IDS)[number];
