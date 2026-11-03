<script lang="ts">
  import { tool } from '../state.svelte.ts';
  import Icon from './Icon.svelte';

  let { onReveal }: { onReveal: () => void } = $props();
  const percent = $derived(Math.round(tool.scale * 100));
</script>

<footer class="status">
  {#if tool.valid}
    <span class="ok"><Icon name="check" size={14} />Valid</span>
  {:else}
    <button type="button" class="bad" onclick={onReveal}>
      <Icon name="alert" size={14} />{tool.errors.length === 1
        ? '1 error'
        : `${tool.errors.length} errors`}
    </button>
  {/if}
  <span
    >{tool.stats.layers} layers · {tool.stats.neurons} neurons · {tool.stats.edges} lines drawn</span
  >
  <span class="notice" role="status" aria-live="polite">{tool.notice}</span>
  <span class="grow"></span>
  <span>Classic</span>
  <span class="zoom">
    <button type="button" aria-label="Zoom out" onclick={() => tool.zoomBy(0.8)}
      ><Icon name="minus" size={14} /></button
    >
    <input
      type="range"
      min="10"
      max="400"
      value={percent}
      aria-label="Zoom"
      oninput={(e) => (tool.zoom = Number(e.currentTarget.value) / 100)}
    />
    <button type="button" aria-label="Zoom in" onclick={() => tool.zoomBy(1.25)}
      ><Icon name="plus" size={14} /></button
    >
    <button type="button" class="percent" title="Fit to window" onclick={() => (tool.zoom = 'fit')}
      >{percent}%</button
    >
  </span>
</footer>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 3px 14px;
    background: var(--surface);
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
  }

  .ok,
  .bad {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .ok {
    color: light-dark(#1f7a4d, #6fd3a0);
  }

  .bad {
    border: 0;
    background: none;
    color: light-dark(#b42318, #ff9b8f);
    font: inherit;
    cursor: pointer;
  }

  .notice {
    color: var(--ink);
  }

  .grow {
    flex: 1;
  }

  .zoom {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .zoom button,
  .bad {
    min-width: 24px;
    min-height: 24px;
  }

  .zoom button {
    display: inline-grid;
    place-items: center;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .zoom input {
    width: 110px;
    accent-color: var(--accent);
  }

  .percent {
    min-width: 3.2em;
  }
</style>
