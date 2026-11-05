<script lang="ts" module>
  type Window = number | [number, number];
</script>

<script lang="ts">
  import {
    changeLayerType,
    LIMITS,
    pair,
    patchLayer,
    patchModel,
    shapeText,
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
  ];

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
