<script lang="ts">
  import {
    insertLayer,
    layerCount,
    patchLayer,
    roleOf,
    shapeText,
    type Layer,
  } from '@xematics/core';
  import { tool } from '../../state.svelte.ts';
  import Icon from '../Icon.svelte';

  let { onDetails }: { onDetails: () => void } = $props();
  const ACTIVATIONS = ['relu', 'tanh', 'softmax'];
  const layers = $derived(tool.model?.layers ?? []);

  /** Dense and convolution layers take an activation; the others do not. */
  const activationOf = (layer: Layer | undefined) =>
    layer && (layer.type === 'dense' || layer.type === 'conv') ? layer.activation : undefined;
  const takesActivation = (layer: Layer) => layer.type === 'dense' || layer.type === 'conv';

  function step(index: number, delta: number) {
    const layer = layers[index];
    const count = layer && layerCount(layer);
    if (!count) return;
    const value = count.value + delta;
    const max = count.max;
    if (value >= 1 && value <= max) tool.edit((m) => patchLayer(m, index, { [count.key]: value }));
  }

  function toggleActivation(index: number, name: string) {
    const current = activationOf(layers[index]);
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
    {@const count = layerCount(layer)}
    <li class="card" class:selected={tool.selection.kind === 'layer' && tool.selection.index === i}>
      <span class={`ph-dot role-${roleOf(i, layers.length)}`} aria-hidden="true"></span>
      <div class="main">
        <button type="button" class="name" onclick={() => details(i)}>{tool.layerName(i)}</button>
        {#if takesActivation(layer)}
          {@const active = activationOf(layer)}
          <div class="chips" role="group" aria-label={`Activation of ${tool.layerName(i)}`}>
            {#each [...new Set([...ACTIVATIONS, ...(active ? [active] : [])])] as name (name)}
              <button
                type="button"
                class="ph-chip"
                aria-pressed={active === name}
                onclick={() => toggleActivation(i, name)}>{name}</button
              >
            {/each}
          </div>
        {:else}
          <span class="shape">{tool.shapes[i] ? shapeText(tool.shapes[i]) : ''}</span>
        {/if}
      </div>
      {#if count}
        <div class="ph-stepper">
          <button
            type="button"
            class="ph-ib"
            aria-label={`Fewer ${count.noun} in ${tool.layerName(i)}`}
            onclick={() => step(i, -1)}
            disabled={count.value <= 1}><Icon name="minus" /></button
          >
          <button
            type="button"
            class="ph-value"
            aria-label={`${count.value} ${count.noun}, edit`}
            onclick={() => details(i)}>{count.value}</button
          >
          <button
            type="button"
            class="ph-ib"
            aria-label={`More ${count.noun} in ${tool.layerName(i)}`}
            onclick={() => step(i, 1)}><Icon name="plus" /></button
          >
        </div>
      {:else}
        <button
          type="button"
          class="ph-ib"
          aria-label={`Edit ${tool.layerName(i)}`}
          onclick={() => details(i)}><Icon name="edit" /></button
        >
      {/if}
    </li>
    <li class="insert-row">
      <button type="button" class="insert" onclick={() => insert(i + 1)}
        ><Icon name="plus" size={14} />Insert layer</button
      >
    </li>
  {/each}
</ul>

<style>
  .shape {
    color: var(--muted);
    font: 0.8rem var(--font-mono);
  }

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
