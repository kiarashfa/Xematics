<script lang="ts">
  import { LIMITS, patchLayer, patchModel, type Layer } from '@xematics/core';
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

  const index = $derived(tool.selection.kind === 'layer' ? tool.selection.index : -1);
  const layer = $derived<Layer | undefined>(tool.model?.layers[index]);
  const collapseMode = $derived(
    layer?.collapse === false ? 'never' : layer?.collapse ? 'custom' : 'default',
  );
  let error = $state('');

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
    const current = layer?.collapse && typeof layer.collapse === 'object' ? layer.collapse : {};
    tool.edit((m) => patchLayer(m, index, { collapse: { ...current, [key]: value } }));
  }
</script>

<aside class="pane" aria-label="Format">
  {#if !tool.model}
    <p class="hint">Waiting for a valid diagram.</p>
  {:else if layer}
    <h2>Format layer</h2>
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
    <label class="field">
      <span>Neurons</span>
      <input type="number" min="1" max={LIMITS.units} value={layer.units} onchange={setUnits} />
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
    {#if collapseMode === 'custom' && layer.collapse}
      <div class="row">
        <label class="field"
          ><span>Show first</span><input
            type="number"
            min="0"
            max="100"
            value={layer.collapse.first ?? tool.collapse.first}
            disabled={tool.preset === 'boxes'}
            onchange={(e) => setCollapseValue('first', e)}
          /></label
        >
        <label class="field"
          ><span>Show last</span><input
            type="number"
            min="0"
            max="100"
            value={layer.collapse.last ?? tool.collapse.last}
            disabled={tool.preset === 'boxes'}
            onchange={(e) => setCollapseValue('last', e)}
          /></label
        >
      </div>
      <label class="field"
        ><span>Collapse above</span><input
          type="number"
          min="1"
          value={layer.collapse.above ?? tool.collapse.above}
          onchange={(e) => setCollapseValue('above', e)}
        /></label
      >
    {/if}
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

  .error {
    color: light-dark(#b42318, #ff9b8f);
  }
</style>
