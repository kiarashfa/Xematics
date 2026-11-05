<script lang="ts" module>
  type Window = number | [number, number];
</script>

<script lang="ts">
  import {
    changeLayerType,
    layerToken,
    LIMITS,
    pair,
    parseShorthand,
    patchLayer,
    patchModel,
    shapeText,
    type DenseLayer,
    type Layer,
    type LayerPatch,
    type LayerType,
  } from '@xematics/core';
  import { tool } from '../state.svelte.ts';

  const ACTIVATIONS = [
    'relu',
    'gelu',
    'tanh',
    'sigmoid',
    'softmax',
    'linear',
    'leaky_relu',
    'elu',
    'swish',
  ];

  const TYPES: [LayerType, string][] = [
    ['dense', 'Dense (fully connected)'],
    ['input', 'Image input'],
    ['conv', 'Convolution'],
    ['pool', 'Pooling'],
    ['gap', 'Global average pooling'],
    ['flatten', 'Flatten'],
    ['sequence', 'Sequence input'],
    ['rnn', 'Recurrent (RNN)'],
    ['lstm', 'LSTM'],
    ['gru', 'GRU'],
    ['tokens', 'Tokens (text input)'],
    ['embed', 'Embedding'],
    ['encoder', 'Transformer encoder'],
    ['decoder', 'Transformer decoder'],
    ['gan', 'GAN (generator and discriminator)'],
    ['autoencoder', 'Autoencoder'],
  ];

  /** A whole-number field of the selected layer; `optional` fields clear when emptied. */
  function setNumber(
    key: string,
    min: number,
    max: number,
    what: string,
    event: Event,
    optional = false,
  ) {
    const raw = (event.currentTarget as HTMLInputElement).value.trim();
    if (optional && raw === '') {
      error = '';
      tool.edit((m) => patchLayer(m, index, { [key]: undefined } as LayerPatch));
      return;
    }
    const value = whole(event, min, max, what);
    if (value !== undefined) tool.edit((m) => patchLayer(m, index, { [key]: value } as LayerPatch));
  }

  function setFlag(key: 'bidirectional' | 'last' | 'vae', on: boolean) {
    tool.edit((m) => patchLayer(m, index, { [key]: on || undefined } as LayerPatch));
  }

  /** A network inside a GAN or autoencoder, written like the shorthand: 100-256-784:tanh. */
  const networkText = (layers: readonly Layer[] | undefined) =>
    layers ? layers.map(layerToken).join('-') : '';

  function setNetwork(key: 'generator' | 'discriminator' | 'encoder' | 'decoder', text: string) {
    const value = text.trim();
    if (key === 'decoder' && value === '') {
      error = '';
      tool.edit((m) => patchLayer(m, index, { decoder: undefined }));
      return;
    }
    const parsed = parseShorthand(value);
    const dense = parsed.layers.filter((l): l is DenseLayer => l.type === 'dense');
    if (
      parsed.diagnostics.length > 0 ||
      dense.length !== parsed.layers.length ||
      dense.length < 2
    ) {
      error = 'Write at least two layer sizes, like 784-256-32 (activations as 784:relu).';
      return;
    }
    error = '';
    tool.edit((m) => patchLayer(m, index, { [key]: dense } as LayerPatch));
  }

  const index = $derived(tool.selection.kind === 'layer' ? tool.selection.index : -1);
  const layer = $derived<Layer | undefined>(tool.model?.layers[index]);
  const dense = $derived(layer?.type === 'dense' ? layer : undefined);
  const collapseMode = $derived(
    dense?.collapse === false ? 'never' : dense?.collapse ? 'custom' : 'default',
  );
  const output = $derived(tool.shapes[index] ? shapeText(tool.shapes[index]) : '');
  let error = $state('');

  /** Reads a whole number from a field, or shows why it is not accepted. */
  function whole(event: Event, min: number, max: number, what: string): number | undefined {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isInteger(value) || value < min || value > max) {
      error = `${what} must be a whole number from ${min} to ${max}.`;
      return undefined;
    }
    error = '';
    return value;
  }

  function setFilters(event: Event) {
    const filters = whole(event, 1, LIMITS.channels, 'Filters');
    if (filters !== undefined) tool.edit((m) => patchLayer(m, index, { filters }));
  }

  /** Kernel, pool window or stride: one number when square, [height, width] otherwise. */
  function setPair(key: 'kernel' | 'size' | 'stride', part: 0 | 1, event: Event, fallback: Window) {
    const value = whole(event, 1, LIMITS.window, part === 0 ? 'Height' : 'Width');
    if (value === undefined || !layer) return;
    const current = (layer as Record<string, unknown>)[key] as Window | undefined;
    const next = pair(current ?? fallback);
    next[part] = value;
    const patch = { [key]: next[0] === next[1] ? next[0] : next } as LayerPatch;
    tool.edit((m) => patchLayer(m, index, patch));
  }

  function setShape(part: 0 | 1 | 2, event: Event) {
    if (layer?.type !== 'input') return;
    const max = part === 2 ? LIMITS.channels : LIMITS.side;
    const value = whole(event, 1, max, ['Height', 'Width', 'Channels'][part]!);
    if (value === undefined) return;
    const next: [number, number, number] = [layer.shape[0], layer.shape[1], layer.shape[2] ?? 1];
    next[part] = value;
    const shape: [number, number] | [number, number, number] =
      next[2] === 1 && layer.shape.length === 2 ? [next[0], next[1]] : next;
    tool.edit((m) => patchLayer(m, index, { shape }));
  }

  function setType(type: string) {
    error = '';
    tool.edit((m) => changeLayerType(m, index, type as LayerType));
  }

  function setUnits(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const units = Number(input.value);
    if (!Number.isInteger(units) || units < 1 || units > LIMITS.units) {
      error = `Neurons must be a whole number from 1 to ${LIMITS.units}.`;
      return;
    }
    error = '';
    tool.edit((m) => patchLayer(m, index, { units }));
  }

  function setActivation(value: string) {
    const activation = value.trim();
    if (activation && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(activation)) {
      error = 'Activations are simple names like relu or softmax.';
      return;
    }
    error = '';
    tool.edit((m) => patchLayer(m, index, { activation: activation || undefined }));
  }

  function setCollapseMode(mode: string) {
    const value =
      mode === 'never'
        ? false
        : mode === 'custom'
          ? { first: tool.collapse.first, last: tool.collapse.last }
          : undefined;
    tool.edit((m) => patchLayer(m, index, { collapse: value }));
  }

  function setCollapseValue(key: 'first' | 'last' | 'above', event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    const max = key === 'above' ? LIMITS.units : LIMITS.collapseKeep;
    if (!Number.isInteger(value) || value < 0 || value > max) return;
    const current = dense?.collapse && typeof dense.collapse === 'object' ? dense.collapse : {};
    tool.edit((m) => patchLayer(m, index, { collapse: { ...current, [key]: value } }));
  }
</script>

<aside class="pane" aria-label="Format">
  {#if !tool.model}
    <p class="hint">Waiting for a valid diagram.</p>
  {:else if layer}
    <h2>Format layer</h2>
    <label class="field">
      <span>Layer type</span>
      <select value={layer.type} onchange={(e) => setType(e.currentTarget.value)}>
        {#each TYPES as [value, label] (value)}<option {value}>{label}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>Name</span>
      <input
        value={layer.name ?? ''}
        placeholder={tool.layerName(index)}
        oninput={(e) =>
          tool.edit(
            (m) => patchLayer(m, index, { name: e.currentTarget.value || undefined }),
            true,
          )}
      />
    </label>
    {#if dense}
      <label class="field">
        <span>Node labels</span>
        <input
          value={dense.nodeLabel ?? ''}
          placeholder={`none, or $x_{i}$`}
          aria-describedby="node-label-hint"
          oninput={(e) =>
            tool.edit(
              (m) => patchLayer(m, index, { nodeLabel: e.currentTarget.value || undefined }),
              true,
            )}
        />
        <small id="node-label-hint" class="hint"
          >{`{i} is the neuron number. Math goes in $...$.`}</small
        >
      </label>
      <label class="field">
        <span>Neurons</span>
        <input type="number" min="1" max={LIMITS.units} value={dense.units} onchange={setUnits} />
      </label>
      <label class="field">
        <span>Activation</span>
        <input
          list="activation-list"
          value={dense.activation ?? ''}
          placeholder="none"
          onchange={(e) => setActivation(e.currentTarget.value)}
        />
        <datalist id="activation-list">
          {#each ACTIVATIONS as a (a)}<option value={a}></option>{/each}
        </datalist>
      </label>
      <label class="field">
        <span>Large layer</span>
        <select
          value={collapseMode}
          disabled={tool.preset === 'boxes'}
          onchange={(e) => setCollapseMode(e.currentTarget.value)}
        >
          <option value="default">Collapse above {tool.collapse.above} (diagram setting)</option>
          <option value="never">Never collapse</option>
          <option value="custom">Custom for this layer</option>
        </select>
      </label>
      {#if collapseMode === 'custom' && dense.collapse}
        <div class="row">
          <label class="field"
            ><span>Show first</span><input
              type="number"
              min="0"
              max="100"
              value={dense.collapse.first ?? tool.collapse.first}
              disabled={tool.preset === 'boxes'}
              onchange={(e) => setCollapseValue('first', e)}
            /></label
          >
          <label class="field"
            ><span>Show last</span><input
              type="number"
              min="0"
              max="100"
              value={dense.collapse.last ?? tool.collapse.last}
              disabled={tool.preset === 'boxes'}
              onchange={(e) => setCollapseValue('last', e)}
            /></label
          >
        </div>
        <label class="field"
          ><span>Collapse above</span><input
            type="number"
            min="1"
            value={dense.collapse.above ?? tool.collapse.above}
            onchange={(e) => setCollapseValue('above', e)}
          /></label
        >
      {/if}
    {:else if layer.type === 'input'}
      <div class="row">
        <label class="field"
          ><span>Height</span><input
            type="number"
            min="1"
            max={LIMITS.side}
            value={layer.shape[0]}
            onchange={(e) => setShape(0, e)}
          /></label
        >
        <label class="field"
          ><span>Width</span><input
            type="number"
            min="1"
            max={LIMITS.side}
            value={layer.shape[1]}
            onchange={(e) => setShape(1, e)}
          /></label
        >
        <label class="field"
          ><span>Channels</span><input
            type="number"
            min="1"
            max={LIMITS.channels}
            value={layer.shape[2] ?? 1}
            onchange={(e) => setShape(2, e)}
          /></label
        >
      </div>
    {:else if layer.type === 'conv'}
      <label class="field">
        <span>Filters</span>
        <input
          type="number"
          min="1"
          max={LIMITS.channels}
          value={layer.filters}
          onchange={setFilters}
        />
      </label>
      <div class="row">
        <label class="field"
          ><span>Kernel height</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.kernel ?? 3)[0]}
            onchange={(e) => setPair('kernel', 0, e, 3)}
          /></label
        >
        <label class="field"
          ><span>Kernel width</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.kernel ?? 3)[1]}
            onchange={(e) => setPair('kernel', 1, e, 3)}
          /></label
        >
      </div>
      <div class="row">
        <label class="field"
          ><span>Stride height</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.stride ?? 1)[0]}
            onchange={(e) => setPair('stride', 0, e, 1)}
          /></label
        >
        <label class="field"
          ><span>Stride width</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.stride ?? 1)[1]}
            onchange={(e) => setPair('stride', 1, e, 1)}
          /></label
        >
      </div>
      <label class="field">
        <span>Padding</span>
        <select
          value={layer.padding ?? 'same'}
          onchange={(e) =>
            tool.edit((m) =>
              patchLayer(m, index, {
                padding: e.currentTarget.value === 'valid' ? 'valid' : undefined,
              }),
            )}
        >
          <option value="same">Same (keeps the size)</option>
          <option value="valid">Valid (no padding)</option>
        </select>
      </label>
      <label class="field">
        <span>Activation</span>
        <input
          list="activation-list"
          value={layer.activation ?? ''}
          placeholder="none"
          onchange={(e) => setActivation(e.currentTarget.value)}
        />
        <datalist id="activation-list">
          {#each ACTIVATIONS as a (a)}<option value={a}></option>{/each}
        </datalist>
      </label>
    {:else if layer.type === 'pool'}
      <label class="field">
        <span>Pooling</span>
        <select
          value={layer.mode ?? 'max'}
          onchange={(e) =>
            tool.edit((m) =>
              patchLayer(m, index, { mode: e.currentTarget.value === 'avg' ? 'avg' : undefined }),
            )}
        >
          <option value="max">Max</option>
          <option value="avg">Average</option>
        </select>
      </label>
      <div class="row">
        <label class="field"
          ><span>Window height</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.size ?? 2)[0]}
            onchange={(e) => setPair('size', 0, e, 2)}
          /></label
        >
        <label class="field"
          ><span>Window width</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.size ?? 2)[1]}
            onchange={(e) => setPair('size', 1, e, 2)}
          /></label
        >
      </div>
      <div class="row">
        <label class="field"
          ><span>Stride height</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.stride ?? layer.size)[0]}
            onchange={(e) => setPair('stride', 0, e, layer.size)}
          /></label
        >
        <label class="field"
          ><span>Stride width</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.stride ?? layer.size)[1]}
            onchange={(e) => setPair('stride', 1, e, layer.size)}
          /></label
        >
      </div>
      <label class="field">
        <span>Padding</span>
        <select
          value={layer.padding ?? 'valid'}
          onchange={(e) =>
            tool.edit((m) =>
              patchLayer(m, index, {
                padding: e.currentTarget.value === 'same' ? 'same' : undefined,
              }),
            )}
        >
          <option value="valid">Valid (no padding)</option>
          <option value="same">Same (keeps the size)</option>
        </select>
      </label>
    {:else if layer.type === 'sequence'}
      <div class="row">
        <label class="field"
          ><span>Steps</span><input
            type="number"
            min="1"
            max={LIMITS.steps}
            value={layer.steps}
            onchange={(e) => setNumber('steps', 1, LIMITS.steps, 'Steps', e)}
          /></label
        >
        <label class="field"
          ><span>Features</span><input
            type="number"
            min="1"
            max={LIMITS.units}
            value={layer.features}
            onchange={(e) => setNumber('features', 1, LIMITS.units, 'Features', e)}
          /></label
        >
      </div>
    {:else if layer.type === 'rnn' || layer.type === 'lstm' || layer.type === 'gru'}
      <label class="field">
        <span>Units</span>
        <input
          type="number"
          min="1"
          max={LIMITS.units}
          value={layer.units}
          onchange={(e) => setNumber('units', 1, LIMITS.units, 'Units', e)}
        />
      </label>
      <label class="field">
        <span>Passes on</span>
        <select
          value={layer.last ? 'last' : 'all'}
          onchange={(e) => setFlag('last', e.currentTarget.value === 'last')}
        >
          <option value="all">Every step (many to many)</option>
          <option value="last">Only the last step (many to one)</option>
        </select>
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={layer.bidirectional === true}
          onchange={(e) => setFlag('bidirectional', e.currentTarget.checked)}
        />
        <span>Bidirectional (reads both ways)</span>
      </label>
      <label class="field">
        <span>Activation</span>
        <input
          list="activation-list"
          value={layer.activation ?? ''}
          placeholder="none"
          onchange={(e) => setActivation(e.currentTarget.value)}
        />
        <datalist id="activation-list">
          {#each ACTIVATIONS as a (a)}<option value={a}></option>{/each}
        </datalist>
      </label>
    {:else if layer.type === 'tokens'}
      <label class="field">
        <span>Length (tokens)</span>
        <input
          type="number"
          min="1"
          max={LIMITS.steps}
          value={layer.length}
          onchange={(e) => setNumber('length', 1, LIMITS.steps, 'Length', e)}
        />
      </label>
    {:else if layer.type === 'embed'}
      <label class="field">
        <span>Width</span>
        <input
          type="number"
          min="1"
          max={LIMITS.units}
          value={layer.width}
          onchange={(e) => setNumber('width', 1, LIMITS.units, 'Width', e)}
        />
      </label>
    {:else if layer.type === 'encoder' || layer.type === 'decoder'}
      <div class="row">
        <label class="field"
          ><span>Blocks</span><input
            type="number"
            min="1"
            max={LIMITS.blocks}
            value={layer.blocks}
            onchange={(e) => setNumber('blocks', 1, LIMITS.blocks, 'Blocks', e)}
          /></label
        >
        <label class="field"
          ><span>Heads</span><input
            type="number"
            min="1"
            max={LIMITS.heads}
            value={layer.heads}
            onchange={(e) => setNumber('heads', 1, LIMITS.heads, 'Heads', e)}
          /></label
        >
      </div>
      <label class="field">
        <span>Feed-forward width</span>
        <input
          type="number"
          min="1"
          max={LIMITS.units}
          value={layer.ff ?? ''}
          placeholder="4 × the width"
          onchange={(e) => setNumber('ff', 1, LIMITS.units, 'Feed-forward width', e, true)}
        />
      </label>
    {:else if layer.type === 'gan'}
      <label class="field">
        <span>Generator</span>
        <input
          class="mono"
          value={networkText(layer.generator)}
          onchange={(e) => setNetwork('generator', e.currentTarget.value)}
        />
      </label>
      <label class="field">
        <span>Discriminator</span>
        <input
          class="mono"
          value={networkText(layer.discriminator)}
          onchange={(e) => setNetwork('discriminator', e.currentTarget.value)}
        />
      </label>
      <p class="hint">
        The generator's first size is the noise; the discriminator ends in the score.
      </p>
    {:else if layer.type === 'autoencoder'}
      <label class="field">
        <span>Encoder</span>
        <input
          class="mono"
          value={networkText(layer.encoder)}
          onchange={(e) => setNetwork('encoder', e.currentTarget.value)}
        />
      </label>
      <label class="field">
        <span>Decoder</span>
        <input
          class="mono"
          value={networkText(layer.decoder)}
          placeholder="mirrors the encoder"
          onchange={(e) => setNetwork('decoder', e.currentTarget.value)}
        />
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={layer.vae === true}
          onchange={(e) => setFlag('vae', e.currentTarget.checked)}
        />
        <span>Variational (mean, spread and a sampled latent)</span>
      </label>
    {/if}
    {#if output}<p class="output">Output <b>{output}</b></p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {:else}
    <h2>Diagram</h2>
    <label class="field">
      <span>Title</span>
      <input
        value={tool.model.title ?? ''}
        placeholder="Neural network diagram"
        oninput={(e) =>
          tool.edit((m) => patchModel(m, { title: e.currentTarget.value || undefined }), true)}
      />
    </label>
    <label class="field">
      <span>Description (alt text)</span>
      <textarea
        rows="5"
        value={tool.model.description ?? ''}
        placeholder={tool.layout?.scene.description ?? ''}
        oninput={(e) =>
          tool.edit(
            (m) => patchModel(m, { description: e.currentTarget.value || undefined }),
            true,
          )}></textarea>
    </label>
    <p class="hint">Select a layer in the navigator or the preview to format it.</p>
  {/if}
</aside>

<style>
  .pane {
    padding: 12px 14px;
    overflow: auto;
    font-size: 0.85rem;
  }

  h2 {
    margin: 0 0 10px;
    font-size: 1rem;
    font-weight: 600;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 10px;
  }

  .field span {
    color: var(--muted);
    font-size: 0.75rem;
  }

  input,
  select,
  textarea {
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.85rem var(--font-sans);
  }

  input[type='number'] {
    font-family: var(--font-mono);
  }

  textarea {
    resize: vertical;
  }

  .row {
    display: flex;
    gap: 8px;
  }

  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 10px;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .row .field {
    flex: 1;
    min-width: 0;
  }

  .hint {
    color: var(--muted);
    font-style: italic;
  }

  .output {
    margin: 0 0 10px;
    color: var(--muted);
  }

  .output b {
    font: 600 0.85rem var(--font-mono);
    color: var(--ink);
  }

  .error {
    color: light-dark(#b42318, #ff9b8f);
  }
</style>
