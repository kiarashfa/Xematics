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
} as const;

export const PRESET_IDS = ['classic'] as const;
export const LAYER_TYPES = ['dense'] as const;

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

export const LayerSchema = v.strictObject(
  {
    type: v.picklist(
      LAYER_TYPES,
      (issue) =>
        `'${String(issue.input)}' is not supported yet. Supported layer types: ${LAYER_TYPES.join(', ')}.`,
    ),
    units: wholeNumber(1, LIMITS.units),
    name: v.optional(text(LIMITS.label)),
    activation: v.optional(
      v.pipe(
        text(LIMITS.activation),
        v.regex(ACTIVATION_PATTERN, 'must be a simple name like relu, tanh or softmax.'),
      ),
    ),
    collapse: v.optional(
      v.union(
        [v.literal(false), CollapseSchema],
        'must be false or an object like { first: 3, last: 3 }.',
      ),
    ),
  },
  'must be a number or an object like { units: 16 }.',
);

export const LabelsSchema = v.strictObject(
  { names: v.optional(flag()), sizes: v.optional(flag()) },
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
export type StyleOptions = v.InferOutput<typeof StyleSchema>;
export type CollapseOptions = v.InferOutput<typeof CollapseSchema>;
export type PresetId = (typeof PRESET_IDS)[number];
