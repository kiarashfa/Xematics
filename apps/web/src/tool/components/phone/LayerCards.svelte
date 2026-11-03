<script lang="ts">
  import { insertLayer, LIMITS, patchLayer, roleOf } from '@xematics/core';
  import { tool } from '../../state.svelte.ts';
  import Icon from '../Icon.svelte';

  let { onDetails }: { onDetails: () => void } = $props();
  const ACTIVATIONS = ['relu', 'tanh', 'softmax'];
  const layers = $derived(tool.model?.layers ?? []);

  function step(index: number, delta: number) {
    const units = (layers[index]?.units ?? 1) + delta;
    if (units >= 1 && units <= LIMITS.units) tool.edit((m) => patchLayer(m, index, { units }));
  }

  function toggleActivation(index: number, name: string) {
    const current = layers[index]?.activation;
    tool.edit((m) => patchLayer(m, index, { activation: current === name ? undefined : name }));
  }

  function details(index: number) {
    tool.select({ kind: 'layer', index });
    onDetails();
  }

  function insert(at: number) {
    if (tool.edit((m) => insertLayer(m, at))) tool.select({ kind: 'layer', index: at });
  }
</script>

<ul class="cards" aria-label="Layers">
  {#each layers as layer, i (i)}
    <li class="card" class:selected={tool.selection.kind === 'layer' && tool.selection.index === i}>
      <span class={`ph-dot role-${roleOf(i, layers.length)}`} aria-hidden="true"></span>
      <div class="main">
        <button type="button" class="name" onclick={() => details(i)}>{tool.layerName(i)}</button>
        <div class="chips" role="group" aria-label={`Activation of ${tool.layerName(i)}`}>
          {#each [...new Set( [...ACTIVATIONS, ...(layer.activation ? [layer.activation] : [])] )] as name (name)}
            <button
              type="button"
              class="ph-chip"
              aria-pressed={layer.activation === name}
              onclick={() => toggleActivation(i, name)}>{name}</button
            >
          {/each}
        </div>
      </div>
      <div class="ph-stepper">
        <button
          type="button"
          class="ph-ib"
          aria-label={`Fewer neurons in ${tool.layerName(i)}`}
          onclick={() => step(i, -1)}
          disabled={layer.units <= 1}><Icon name="minus" /></button
        >
        <button
          type="button"
          class="ph-value"
          aria-label={`${layer.units} neurons, edit`}
          onclick={() => details(i)}>{layer.units}</button
        >
        <button
          type="button"
          class="ph-ib"
          aria-label={`More neurons in ${tool.layerName(i)}`}
          onclick={() => step(i, 1)}><Icon name="plus" /></button
        >
      </div>
    </li>
    <li class="insert-row">
      <button type="button" class="insert" onclick={() => insert(i + 1)}
        ><Icon name="plus" size={14} />Insert layer</button
      >
    </li>
  {/each}
</ul>

<style>
  .cards {
    flex: 1;
    margin: 0;
    padding: 8px 12px 12px;
    overflow: auto;
    list-style: none;
  }

  .card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 12px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
  }

  .card.selected {
    border-color: var(--accent);
  }

  .main {
    flex: 1;
    min-width: 0;
  }

  .name {
    display: block;
    max-width: 100%;
    min-height: 28px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: 600 0.95rem var(--font-sans);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .insert-row {
    display: flex;
    justify-content: center;
  }

  .insert {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 32px;
    padding: 0 12px;
    border: 0;
    background: none;
    color: var(--accent);
    font: 600 0.78rem var(--font-sans);
  }
</style>
