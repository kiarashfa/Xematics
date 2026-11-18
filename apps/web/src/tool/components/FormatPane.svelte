<script lang="ts">
  import {
    groupDigits,
    LIMITS,
    pair,
    patchLayer,
    patchModel,
    shapeText,
    type Layer,
  } from '@xematics/core';
  import {
    ACTIVATIONS,
    collapseModeOf,
    networkText,
    setActivation,
    setCollapseMode,
    setCollapseValue,
    setDrawnShape,
    setFilters,
    setSkip,
    SKIP_TYPES,
    setFlag,
    setNetwork,
    setNumber,
    setPair,
    setShape,
    setType,
    setUnits,
    TYPES,
  } from '../layer-edit.ts';
  import { tool } from '../state.svelte.ts';

  // The selected layer's settings as a form: the phone's details sheet (desktop uses the
  // ribbon's Layer tab). With no layer selected it edits the title and the description.
  const index = $derived(tool.selection.kind === 'layer' ? tool.selection.index : -1);
  const layer = $derived<Layer | undefined>(tool.model?.layers[index]);
  const dense = $derived(layer?.type === 'dense' ? layer : undefined);
  const collapseMode = $derived(collapseModeOf(layer));
  const output = $derived(tool.shapes[index] ? shapeText(tool.shapes[index]) : '');
  const error = $derived(tool.layerError.message);
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
    {:else if layer.type === 'input' || layer.type === 'reshape'}
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
    {:else if layer.type === 'conv' || layer.type === 'deconv'}
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
    {:else if layer.type === 'up'}
      <div class="row">
        <label class="field"
          ><span>Size height</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.size)[0]}
            onchange={(e) => setPair('size', 0, e, 2)}
          /></label
        >
        <label class="field"
          ><span>Size width</span><input
            type="number"
            min="1"
            max={LIMITS.window}
            value={pair(layer.size)[1]}
            onchange={(e) => setPair('size', 1, e, 2)}
          /></label
        >
      </div>
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
    {#if SKIP_TYPES.has(layer.type) && index > 0}
      {@const skip = 'skip' in layer ? layer.skip : undefined}
      <div class="row">
        <label class="field">
          <span>Skip from</span>
          <select
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
          </select>
        </label>
        <label class="field">
          <span>Join</span>
          <select
            disabled={!skip}
            value={skip?.op ?? 'add'}
            onchange={(e) =>
              skip && setSkip(skip.from, e.currentTarget.value === 'concat' ? 'concat' : 'add')}
          >
            <option value="add">Add (ResNet)</option>
            <option value="concat">Stack (U-Net)</option>
          </select>
        </label>
      </div>
    {/if}
    {#if layer.type === 'conv' || layer.type === 'pool' || layer.type === 'deconv' || layer.type === 'up'}
      <label class="field">
        <span>Draw as (empty: the computed size)</span>
        <input
          type="text"
          placeholder={output || 'Automatic'}
          spellcheck="false"
          value={layer.shape ?? ''}
          onchange={(e) => setDrawnShape(e.currentTarget.value)}
        />
      </label>
    {/if}
    {#if output}<p class="output">
        Output <b>{output}</b>{#if tool.layerParams[index]}
          · Parameters <b
            >{groupDigits(tool.layerParams[index].weights + tool.layerParams[index].biases)}</b
          >{/if}
      </p>{/if}
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
