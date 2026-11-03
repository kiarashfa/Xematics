<script lang="ts">
  import wordmark from '../../assets/wordmark.svg?raw';
  import { copyShareLink, copySvg, downloadSource, exportSvg } from '../actions.ts';
  import { tool } from '../state.svelte.ts';
  import Canvas from './Canvas.svelte';
  import FormatPane from './FormatPane.svelte';
  import FormulaBar from './FormulaBar.svelte';
  import Icon from './Icon.svelte';
  import Navigator from './Navigator.svelte';
  import SourceEditor from './SourceEditor.svelte';

  let { home }: { home: string } = $props();
  const TABS = ['Edit', 'Layers', 'Style', 'Export'] as const;
  let tab = $state<(typeof TABS)[number]>('Edit');

  function setNumber(key: 'first' | 'last', event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isInteger(value) && value >= 0 && value <= 100) tool.setCollapse(key, value);
  }
</script>

{#snippet toggle(label: string, checked: boolean, change: (on: boolean) => void)}
  <label class="switch">
    <input
      type="checkbox"
      role="switch"
      {checked}
      onchange={(e) => change(e.currentTarget.checked)}
    />
    <span aria-hidden="true"></span>{label}
  </label>
{/snippet}

<div class="phone">
  <header class="bar">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- static wordmark generated at build time -->
    <a class="brand" href={home} aria-label="Xematics home">{@html wordmark}</a>
    <h1>{tool.model?.title || 'Untitled diagram'}</h1>
    <button type="button" aria-label="Undo" disabled={!tool.canUndo} onclick={() => tool.undo()}
      ><Icon name="undo" /></button
    >
    <button type="button" aria-label="Redo" disabled={!tool.canRedo} onclick={() => tool.redo()}
      ><Icon name="redo" /></button
    >
  </header>

  <Canvas />

  <section class="sheet" aria-label="Editor">
    <div class="tabs" role="tablist" aria-label="Editor sections">
      {#each TABS as t (t)}
        <button type="button" role="tab" aria-selected={tab === t} onclick={() => (tab = t)}
          >{t}</button
        >
      {/each}
    </div>
    <div class="content" role="tabpanel">
      {#if tab === 'Edit'}
        <FormulaBar />
        <SourceEditor rows={6} />
      {:else if tab === 'Layers'}
        <Navigator />
        <FormatPane />
      {:else if tab === 'Style'}
        <div class="options">
          {@render toggle('Layer names', tool.labels.names, (on) => tool.setLabel('names', on))}
          {@render toggle('Neuron counts', tool.labels.sizes, (on) => tool.setLabel('sizes', on))}
          {@render toggle('Transparent background', tool.transparent, (on) =>
            tool.setTransparent(on),
          )}
          <label class="number"
            >Show first <input
              type="number"
              min="0"
              max="100"
              value={tool.collapse.first}
              onchange={(e) => setNumber('first', e)}
            /></label
          >
          <label class="number"
            >Show last <input
              type="number"
              min="0"
              max="100"
              value={tool.collapse.last}
              onchange={(e) => setNumber('last', e)}
            /></label
          >
        </div>
      {:else}
        <div class="options">
          <button type="button" class="btn btn-primary" onclick={exportSvg} disabled={!tool.layout}
            ><Icon name="download" />Download SVG</button
          >
          <button type="button" class="btn" onclick={copySvg} disabled={!tool.layout}
            ><Icon name="copy" />Copy SVG</button
          >
          <button type="button" class="btn" onclick={copyShareLink} disabled={!tool.ready}
            ><Icon name="link" />Copy share link</button
          >
          <button type="button" class="btn" onclick={downloadSource}
            ><Icon name="file" />Save source</button
          >
          {@render toggle('Editable text in the SVG', tool.liveText, (on) => (tool.liveText = on))}
        </div>
      {/if}
      <p class="notice" role="status" aria-live="polite">{tool.notice}</p>
    </div>
  </section>
</div>

<style>
  .phone {
    display: grid;
    grid-template-rows: auto minmax(200px, 1fr) auto;
    height: 100dvh;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }

  .brand {
    display: inline-flex;
    color: var(--ink);
  }

  .brand :global(svg) {
    height: 22px;
    width: auto;
  }

  h1 {
    flex: 1;
    margin: 0 6px;
    font-size: 0.9rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar button {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    background: none;
    color: var(--ink);
  }

  .bar button:disabled {
    opacity: 0.4;
  }

  .sheet {
    max-height: 56dvh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-top: 1px solid var(--line);
    box-shadow: 0 -6px 20px rgb(0 0 0 / 0.08);
  }

  .tabs {
    display: flex;
    margin: 8px 10px 0;
    border: 1px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
  }

  .tabs button {
    flex: 1;
    min-height: 42px;
    border: 0;
    background: var(--surface);
    color: var(--ink);
    font: 600 0.85rem var(--font-sans);
  }

  .tabs button + button {
    border-left: 1px solid var(--line);
  }

  .tabs button[aria-selected='true'] {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .content {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
  }

  .options .btn {
    justify-content: center;
    min-height: 44px;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
  }

  .switch {
    position: relative;
  }

  /* The real checkbox covers the whole label, so every click reaches it. */
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
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--line);
    flex: none;
  }

  .switch span::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
  }

  .switch input:checked + span {
    background: var(--accent);
  }

  .switch input:checked + span::after {
    left: 18px;
  }

  .switch input:focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .number {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .number input {
    width: 90px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.9rem var(--font-mono);
  }

  .notice {
    margin: 0;
    padding: 0 14px 10px;
    min-height: 1em;
    font-size: 0.85rem;
  }
</style>
