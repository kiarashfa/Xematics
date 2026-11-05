<script lang="ts">
  import { roleOf, shapeText } from '@xematics/core';
  import { tool } from '../state.svelte.ts';
  import Icon from './Icon.svelte';

  const layers = $derived(tool.model?.layers ?? []);

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    // Alt with an arrow moves the layer (an editor shortcut), so leave it alone.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const current = tool.selection.kind === 'layer' ? tool.selection.index : -1;
    const next = Math.max(
      -1,
      Math.min(layers.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)),
    );
    tool.select(next === -1 ? { kind: 'diagram' } : { kind: 'layer', index: next });
    document.getElementById(`nav-item-${next}`)?.focus();
  }
</script>

<nav class="navigator" aria-label="Layers">
  <p class="heading label-caps">Navigator</p>
  <ul>
    <li>
      <button
        type="button"
        id="nav-item--1"
        class="item"
        aria-current={tool.selection.kind === 'diagram' ? 'true' : undefined}
        onclick={() => tool.select({ kind: 'diagram' })}
        onkeydown={onKey}
      >
        <Icon name="layers" size={15} /><span class="name">{tool.model?.title || 'Diagram'}</span>
      </button>
    </li>
    {#each layers as _layer, i (i)}
      <li>
        <button
          type="button"
          id={`nav-item-${i}`}
          class="item child"
          aria-current={tool.selection.kind === 'layer' && tool.selection.index === i
            ? 'true'
            : undefined}
          onclick={() => tool.select({ kind: 'layer', index: i })}
          onkeydown={onKey}
        >
          <span class={`dot role-${roleOf(i, layers.length)}`} aria-hidden="true"></span>
          <span class="name">{tool.layerName(i)}</span>
          <span class="units">{tool.shapes[i] ? shapeText(tool.shapes[i]) : ''}</span>
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .navigator {
    padding: 10px 10px 6px;
  }

  .heading {
    margin: 0 0 6px 6px;
    color: var(--muted);
    font-size: 0.68rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 28px;
    padding: 4px 6px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--ink);
    font: 0.85rem var(--font-sans);
    text-align: left;
    cursor: pointer;
  }

  .item.child {
    padding-left: 22px;
  }

  .item:hover {
    background: var(--surface-2);
  }

  .item[aria-current='true'] {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .units {
    font: 0.8rem var(--font-mono);
    color: var(--muted);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid #4b5563;
    background: #f1f2f4;
    flex: none;
  }

  .dot.role-input {
    border-color: #0072b2;
    background: #d4e8f5;
  }

  .dot.role-output {
    border-color: #b97800;
    background: #fbe8c4;
  }
</style>
