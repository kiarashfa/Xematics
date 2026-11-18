<script lang="ts">
  import { groupDigits, LIMITS, pair, shapeText, type Layer } from '@xematics/core';
  import type { Snippet } from 'svelte';
  import {
    ACTIVATIONS,
    collapseModeOf,
    networkText,
    setActivation,
    setCollapseMode,
    setCollapseValue,
    setDrawnShape,
    setFilters,
    setFlag,
    setName,
    setNetwork,
    setNodeLabel,
    setNumber,
    setPadding,
    setPair,
    setPoolMode,
    setShape,
    setSkip,
    SKIP_TYPES,
    setType,
    setUnits,
    TYPES,
  } from '../layer-edit.ts';
  import { tool } from '../state.svelte.ts';
  import type { IconName } from './Icon.svelte';

  // The contextual Layer tab: every setting of the selected layer, in groups that follow its
  // type. The ribbon draws the groups (and folds them on narrow windows) with `group`.
  type Group = Snippet<[number, string, IconName, string, string, string, Snippet]>;
  let { group }: { group: Group } = $props();

  const index = $derived(tool.selection.kind === 'layer' ? tool.selection.index : -1);
  const layer = $derived<Layer | undefined>(tool.model?.layers[index]);
  const output = $derived(tool.shapes[index] ? shapeText(tool.shapes[index]) : '');
  const params = $derived(tool.layerParams[index]);
  const error = $derived(tool.layerError);
  const bad = (key: string) => error.key === key;

  interface Part {
    name: string;
    icon: IconName;
    label: string;
    body: Snippet;
  }

  const parts = $derived.by<Part[]>(() => {
    const l = layer;
    if (!l) return [];
    const out: Part[] = [{ name: 'Layer', icon: 'layers', label: 'Layer', body: gLayer }];
    const add = (name: string, icon: IconName, body: Snippet, label = name) =>
      out.push({ name, icon, label, body });
    switch (l.type) {
      case 'dense':
        add('Size', 'size', gDense);
        add('Node labels', 'tag', gNodeLabels, 'Labels');
        add('Large layer', 'fit', gCollapse, 'Large');
        break;
      case 'input':
        add('Image size', 'size', gImage, 'Size');
        break;
      case 'reshape':
        add('Map size', 'size', gImage, 'Size');
        break;
      case 'conv':
      case 'deconv':
        add('Filters', 'size', gFilters);
        add('Kernel', 'kernel', gKernel);
        add('Stride', 'stride', gStride);
        break;
      case 'pool':
        add('Window', 'kernel', gWindow);
        add('Stride', 'stride', gStride);
        break;
      case 'up':
        add('Size', 'kernel', gWindow);
        break;
      case 'sequence':
        add('Sequence', 'size', gSequence);
        break;
      case 'rnn':
      case 'lstm':
      case 'gru':
        add('Units', 'size', gUnits);
        add('Reading', 'layers', gReading);
        break;
      case 'tokens':
        add('Tokens', 'size', gTokens);
        break;
      case 'embed':
        add('Embedding', 'size', gEmbed);
        break;
      case 'encoder':
      case 'decoder':
        add('Blocks', 'layers', gBlocks);
        break;
      case 'gan':
      case 'autoencoder':
        add('Networks', 'layers', gNetworks);
        break;
    }
    if (SKIP_TYPES.has(l.type) && index > 0) add('Skip', 'link', gSkip);
    if (output) add('Output', 'info', gOutput);
    return out;
  });
</script>

{#snippet number(
  label: string,
  key: string,
  value: number | string,
  min: number,
  max: number,
  change: (event: Event) => void,
  aria = label,
  placeholder = '',
)}
  <label title={bad(key) ? error.message : undefined}
    >{label}<input
      type="number"
      class:bad={bad(key)}
      aria-label={aria}
      aria-invalid={bad(key) || undefined}
      {min}
      {max}
      {value}
      {placeholder}
      onchange={change}
    /></label
  >
{/snippet}

{#snippet activation(value: string | undefined)}
  <label title={bad('activation') ? error.message : undefined}
    >Activation<input
      class="text short"
      class:bad={bad('activation')}
      list="layer-activations"
      value={value ?? ''}
      placeholder="none"
      onchange={(e) => setActivation(e.currentTarget.value)}
    /></label
  >
  <datalist id="layer-activations">
    {#each ACTIVATIONS as a (a)}<option value={a}></option>{/each}
  </datalist>
{/snippet}

{#snippet toggle(label: string, checked: boolean, change: (on: boolean) => void)}
  <label class="switch">
    <input
      type="checkbox"
      role="switch"
      {checked}
      onchange={(e) => change(e.currentTarget.checked)}
    /><span aria-hidden="true"></span>{label}
  </label>
{/snippet}

{#snippet gLayer()}
  {#if layer}
    <div class="fields">
      <label
        >Type<select
          aria-label="Layer type"
          value={layer.type}
          onchange={(e) => setType(e.currentTarget.value)}
        >
          {#each TYPES as [value, label] (value)}<option {value}>{label}</option>{/each}
        </select></label
      >
      <label
        >Name<input
          class="text"
          value={layer.name ?? ''}
          placeholder={tool.layerName(index)}
          oninput={(e) => setName(e.currentTarget.value)}
        /></label
      >
    </div>
  {/if}
{/snippet}

{#snippet gDense()}
  {#if layer?.type === 'dense'}
    <div class="fields">
      {@render number('Neurons', 'units', layer.units, 1, LIMITS.units, setUnits)}
      {@render activation(layer.activation)}
    </div>
  {/if}
{/snippet}

{#snippet gNodeLabels()}
  {#if layer?.type === 'dense'}
    <div class="fields">
      <label
        >Node labels<input
          class="text"
          aria-describedby="node-label-hint"
          value={layer.nodeLabel ?? ''}
          placeholder={'none, or $x_{i}$'}
          oninput={(e) => setNodeLabel(e.currentTarget.value)}
        /></label
      >
      <span id="node-label-hint" class="hint"
        >{`{i} is the neuron number. Math goes in $...$.`}</span
      >
    </div>
  {/if}
{/snippet}

{#snippet gCollapse()}
  {#if layer?.type === 'dense'}
    {@const mode = collapseModeOf(layer)}
    {@const custom = typeof layer.collapse === 'object' ? layer.collapse : undefined}
    <div class="fields">
      <label
        >Collapse<select
          aria-label="Large layer collapse"
          value={mode}
          disabled={tool.preset === 'boxes'}
          onchange={(e) => setCollapseMode(e.currentTarget.value)}
        >
          <option value="default">Above {tool.collapse.above} (diagram setting)</option>
          <option value="never">Never</option>
          <option value="custom">Custom for this layer</option>
        </select></label
      >
      {#if custom}
        {@render number(
          'Show first',
          'collapse-first',
          custom.first ?? tool.collapse.first,
          0,
          LIMITS.collapseKeep,
          (e) => setCollapseValue('first', e),
        )}
        {@render number(
          'Show last',
          'collapse-last',
          custom.last ?? tool.collapse.last,
          0,
          LIMITS.collapseKeep,
          (e) => setCollapseValue('last', e),
        )}
      {/if}
    </div>
    {#if custom}
      <div class="fields">
        {@render number(
          'Above',
          'collapse-above',
          custom.above ?? tool.collapse.above,
          1,
          LIMITS.units,
          (e) => setCollapseValue('above', e),
          'Collapse above',
        )}
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet gImage()}
  {#if layer?.type === 'input' || layer?.type === 'reshape'}
    <div class="fields">
      {@render number('Height', 'shape0', layer.shape[0], 1, LIMITS.side, (e) => setShape(0, e))}
      {@render number('Width', 'shape1', layer.shape[1], 1, LIMITS.side, (e) => setShape(1, e))}
      {@render number('Channels', 'shape2', layer.shape[2] ?? 1, 1, LIMITS.channels, (e) =>
        setShape(2, e),
      )}
    </div>
  {/if}
{/snippet}

{#snippet gFilters()}
  {#if layer?.type === 'conv' || layer?.type === 'deconv'}
    <div class="fields">
      {@render number('Filters', 'filters', layer.filters, 1, LIMITS.channels, setFilters)}
      {@render activation(layer.activation)}
    </div>
  {/if}
{/snippet}

{#snippet gKernel()}
  {#if layer?.type === 'conv' || layer?.type === 'deconv'}
    {@const k = pair(layer.kernel ?? 3)}
    <div class="fields">
      {@render number(
        'Height',
        'kernel0',
        k[0],
        1,
        LIMITS.window,
        (e) => setPair('kernel', 0, e, 3),
        'Kernel height',
      )}
      {@render number(
        'Width',
        'kernel1',
        k[1],
        1,
        LIMITS.window,
        (e) => setPair('kernel', 1, e, 3),
        'Kernel width',
      )}
    </div>
  {/if}
{/snippet}

{#snippet gWindow()}
  {#if layer?.type === 'pool' || layer?.type === 'up'}
    {@const w = pair(layer.size ?? 2)}
    <div class="fields">
      {#if layer.type === 'pool'}
        <label
          >Mode<select
            aria-label="Pooling mode"
            value={layer.mode ?? 'max'}
            onchange={(e) => setPoolMode(e.currentTarget.value === 'avg')}
          >
            <option value="max">Max</option>
            <option value="avg">Average</option>
          </select></label
        >
      {/if}
      {@render number(
        'Height',
        'size0',
        w[0],
        1,
        LIMITS.window,
        (e) => setPair('size', 0, e, 2),
        'Window height',
      )}
      {@render number(
        'Width',
        'size1',
        w[1],
        1,
        LIMITS.window,
        (e) => setPair('size', 1, e, 2),
        'Window width',
      )}
    </div>
  {/if}
{/snippet}

{#snippet gStride()}
  {#if layer?.type === 'conv' || layer?.type === 'pool' || layer?.type === 'deconv'}
    {@const fallback = layer.type === 'pool' ? (layer.size ?? 2) : 1}
    {@const conv = layer.type !== 'pool'}
    {@const s = pair(layer.stride ?? fallback)}
    <div class="fields">
      {@render number(
        'Height',
        'stride0',
        s[0],
        1,
        LIMITS.window,
        (e) => setPair('stride', 0, e, fallback),
        'Stride height',
      )}
      {@render number(
        'Width',
        'stride1',
        s[1],
        1,
        LIMITS.window,
        (e) => setPair('stride', 1, e, fallback),
        'Stride width',
      )}
      <label
        >Padding<select
          value={layer.padding ?? (conv ? 'same' : 'valid')}
          onchange={(e) => {
            const v = e.currentTarget.value;
            setPadding(
              conv ? (v === 'valid' ? 'valid' : undefined) : v === 'same' ? 'same' : undefined,
            );
          }}
        >
          <option value="same">Same (keeps the size)</option>
          <option value="valid">Valid (no padding)</option>
        </select></label
      >
    </div>
  {/if}
{/snippet}

{#snippet gSkip()}
  {#if layer}
    {@const skip = 'skip' in layer ? layer.skip : undefined}
    <div class="fields">
      <label
        >From<select
          aria-label="Skip from"
          value={skip ? String(skip.from) : ''}
          onchange={(e) => {
            const v = e.currentTarget.value;
            setSkip(v === '' ? undefined : Number(v), skip?.op ?? 'add');
          }}
        >
          <option value="">No skip</option>
          {#each Array.from({ length: index }, (_, k) => k) as k (k)}
            <option value={String(k + 1)}>{k + 1}. {tool.layerName(k)}</option>
          {/each}
        </select></label
      >
      <label
        >Join<select
          aria-label="Skip join"
          disabled={!skip}
          value={skip?.op ?? 'add'}
          onchange={(e) =>
            skip && setSkip(skip.from, e.currentTarget.value === 'concat' ? 'concat' : 'add')}
        >
          <option value="add">Add (ResNet)</option>
          <option value="concat">Stack (U-Net)</option>
        </select></label
      >
    </div>
  {/if}
{/snippet}

{#snippet gSequence()}
  {#if layer?.type === 'sequence'}
    <div class="fields">
      {@render number('Steps', 'steps', layer.steps, 1, LIMITS.steps, (e) =>
        setNumber('steps', 1, LIMITS.steps, 'Steps', e),
      )}
      {@render number('Features', 'features', layer.features, 1, LIMITS.units, (e) =>
        setNumber('features', 1, LIMITS.units, 'Features', e),
      )}
    </div>
  {/if}
{/snippet}

{#snippet gUnits()}
  {#if layer?.type === 'rnn' || layer?.type === 'lstm' || layer?.type === 'gru'}
    <div class="fields">
      {@render number('Units', 'units', layer.units, 1, LIMITS.units, (e) =>
        setNumber('units', 1, LIMITS.units, 'Units', e),
      )}
      {@render activation(layer.activation)}
    </div>
  {/if}
{/snippet}

{#snippet gReading()}
  {#if layer?.type === 'rnn' || layer?.type === 'lstm' || layer?.type === 'gru'}
    <div class="fields">
      <label
        >Passes on<select
          value={layer.last ? 'last' : 'all'}
          onchange={(e) => setFlag('last', e.currentTarget.value === 'last')}
        >
          <option value="all">Every step (many to many)</option>
          <option value="last">Only the last step (many to one)</option>
        </select></label
      >
      {@render toggle('Bidirectional (reads both ways)', layer.bidirectional === true, (on) =>
        setFlag('bidirectional', on),
      )}
    </div>
  {/if}
{/snippet}

{#snippet gTokens()}
  {#if layer?.type === 'tokens'}
    <div class="fields">
      {@render number(
        'Length',
        'length',
        layer.length,
        1,
        LIMITS.steps,
        (e) => setNumber('length', 1, LIMITS.steps, 'Length', e),
        'Length (tokens)',
      )}
      <label
        >Words<input
          class="text"
          aria-label="Token words"
          title={`Shown by Token flow and Heat map; up to ${LIMITS.words} words`}
          placeholder="The cat sat"
          spellcheck="false"
          value={tool.model?.tokens?.join(' ') ?? ''}
          aria-invalid={bad('words')}
          onchange={(e) => {
            if (tool.setTokens(e.currentTarget.value)) tool.layerError = { key: '', message: '' };
            else
              tool.layerError = {
                key: 'words',
                message: `Use up to ${LIMITS.words} words of at most ${LIMITS.word} letters.`,
              };
          }}
        /></label
      >
    </div>
  {/if}
{/snippet}

{#snippet gEmbed()}
  {#if layer?.type === 'embed'}
    <div class="fields">
      {@render number('Width', 'width', layer.width, 1, LIMITS.units, (e) =>
        setNumber('width', 1, LIMITS.units, 'Width', e),
      )}
    </div>
  {/if}
{/snippet}

{#snippet gBlocks()}
  {#if layer?.type === 'encoder' || layer?.type === 'decoder'}
    <div class="fields">
      {@render number('Blocks', 'blocks', layer.blocks, 1, LIMITS.blocks, (e) =>
        setNumber('blocks', 1, LIMITS.blocks, 'Blocks', e),
      )}
      {@render number('Heads', 'heads', layer.heads, 1, LIMITS.heads, (e) =>
        setNumber('heads', 1, LIMITS.heads, 'Heads', e),
      )}
      {@render number(
        'Feed-forward',
        'ff',
        layer.ff ?? '',
        1,
        LIMITS.units,
        (e) => setNumber('ff', 1, LIMITS.units, 'Feed-forward width', e, true),
        'Feed-forward width',
        '4 × width',
      )}
    </div>
  {/if}
{/snippet}

{#snippet network(
  label: string,
  key: 'generator' | 'discriminator' | 'encoder' | 'decoder',
  value: string,
  placeholder = '',
)}
  <label title={bad(key) ? error.message : undefined}
    >{label}<input
      class="wide"
      class:bad={bad(key)}
      spellcheck="false"
      {value}
      {placeholder}
      onchange={(e) => setNetwork(key, e.currentTarget.value)}
    /></label
  >
{/snippet}

{#snippet gNetworks()}
  {#if layer?.type === 'gan'}
    <div class="fields">
      {@render network('Generator', 'generator', networkText(layer.generator))}
      {@render network('Discriminator', 'discriminator', networkText(layer.discriminator))}
      <span class="hint"
        >The generator's first size is the noise; the discriminator ends in the score.</span
      >
    </div>
  {:else if layer?.type === 'autoencoder'}
    <div class="fields">
      {@render network('Encoder', 'encoder', networkText(layer.encoder))}
      {@render network('Decoder', 'decoder', networkText(layer.decoder), 'mirrors the encoder')}
      {@render toggle('Variational (mean, spread, sampled latent)', layer.vae === true, (on) =>
        setFlag('vae', on),
      )}
    </div>
  {/if}
{/snippet}

{#snippet gOutput()}
  {#if layer?.type === 'conv' || layer?.type === 'pool' || layer?.type === 'deconv' || layer?.type === 'up'}
    <div class="fields">
      <span class="line">Output <b>{output}</b></span>
      {#if params}
        <span
          class="line"
          title={`${groupDigits(params.weights)} weights + ${groupDigits(params.biases)} biases`}
          >Parameters <b>{groupDigits(params.weights + params.biases)}</b></span
        >
      {/if}
      <label
        >Draw as <input
          type="text"
          class:bad={bad('shape')}
          aria-invalid={bad('shape')}
          title={bad('shape') ? error.message : 'Leave empty to draw the computed size'}
          placeholder="Automatic"
          spellcheck="false"
          size="9"
          value={layer.shape ?? ''}
          onchange={(e) => setDrawnShape(e.currentTarget.value)}
        /></label
      >
    </div>
  {:else}
    <div class="readouts">
      <p class="readout">Output <b>{output}</b></p>
      {#if params}
        <p
          class="readout"
          title={`${groupDigits(params.weights)} weights + ${groupDigits(params.biases)} biases`}
        >
          Parameters <b>{groupDigits(params.weights + params.biases)}</b>
        </p>
      {/if}
    </div>
  {/if}
{/snippet}

{#each parts as part, i (part.name)}
  {@render group(i, part.name, part.icon, part.label, part.name, '', part.body)}
{/each}

<style>
  .fields {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 24px;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  input,
  select {
    min-height: 24px;
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.8rem var(--font-sans);
  }

  input[type='number'] {
    width: 84px;
    font-family: var(--font-mono);
  }

  select {
    max-width: 190px;
  }

  .text {
    width: 150px;
  }

  .text.short {
    width: 96px;
  }

  .wide {
    width: 230px;
    font-family: var(--font-mono);
  }

  input:focus-visible,
  select:focus-visible {
    position: relative;
    z-index: 1;
  }

  .bad {
    border-color: #d55e00;
    outline: 1px solid #d55e00;
  }

  .hint {
    color: var(--muted);
    font-size: 0.7rem;
    white-space: nowrap;
  }

  .readouts {
    display: flex;
    gap: 14px;
    height: 100%;
  }

  .line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-height: 24px;
    color: var(--muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .line b {
    color: var(--ink);
    font: 600 0.85rem var(--font-mono);
  }

  .readout {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    margin: 0;
    padding: 0 6px;
    color: var(--muted);
    font-size: 0.8rem;
  }

  .readout b {
    color: var(--ink);
    font: 600 1.05rem var(--font-mono);
  }

  .switch {
    position: relative;
    justify-content: flex-start;
    padding: 3px 4px;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .switch span {
    position: relative;
    flex: none;
    width: 28px;
    height: 16px;
    border-radius: 8px;
    background: var(--line);
  }

  .switch span::after {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    content: '';
  }

  .switch input:checked + span {
    background: var(--accent);
  }

  .switch input:checked + span::after {
    left: 14px;
  }

  .switch input:focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
