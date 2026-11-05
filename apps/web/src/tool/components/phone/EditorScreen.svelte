<script lang="ts">
  import { layerCount, LIMITS, patchLayer, shapeText } from '@xematics/core';
  import { copyShareLink } from '../../actions.ts';
  import { tool } from '../../state.svelte.ts';
  import Canvas from '../Canvas.svelte';
  import FormatPane from '../FormatPane.svelte';
  import Icon, { type IconName } from '../Icon.svelte';
  import SourceEditor from '../SourceEditor.svelte';
  import CommandSheet, { type CommandTab } from './CommandSheet.svelte';
  import LayerCards from './LayerCards.svelte';
  import Sheet from './Sheet.svelte';
  import ShorthandPad from './ShorthandPad.svelte';

  let { onFiles }: { onFiles: () => void } = $props();

  type View = 'canvas' | 'layers' | 'source' | 'pad';
  const VIEWS: [View, IconName, string][] = [
    ['canvas', 'canvas', 'Figure'],
    ['layers', 'cards', 'Layer cards'],
    ['source', 'code', 'Source'],
    ['pad', 'keypad', 'Shorthand pad'],
  ];
  // Quick keys for YAML and shorthand, shown above the phone keyboard in the source view.
  const SYMBOLS = ['-', ':', ', ', '{ ', ' }', '- { units: ', 'name: ', 'relu', 'tanh', 'softmax'];

  let view = $state<View>('canvas');
  let sheet = $state<'commands' | 'details' | undefined>();
  let commandTab = $state<CommandTab>('Home');
  let source: SourceEditor | undefined = $state();

  const index = $derived(tool.selection.kind === 'layer' ? tool.selection.index : -1);
  const layer = $derived(tool.model?.layers[index]);
  const count = $derived(layer ? layerCount(layer) : undefined);
  const activation = $derived(
    layer && (layer.type === 'dense' || layer.type === 'conv') ? layer.activation : undefined,
  );

  function openCommands(tab: CommandTab = commandTab) {
    commandTab = tab;
    sheet = 'commands';
  }

  function step(delta: number) {
    if (!count) return;
    const value = count.value + delta;
    const max = count.key === 'units' ? LIMITS.units : LIMITS.channels;
    if (value >= 1 && value <= max) tool.edit((m) => patchLayer(m, index, { [count.key]: value }));
  }
</script>

<div class="editor">
  <header class="ph-bar">
    <button type="button" class="ph-ib" aria-label="All documents" onclick={onFiles}
      ><Icon name="back" /></button
    >
    <h1>{tool.model?.title || 'Untitled diagram'}</h1>
    <button
      type="button"
      class="ph-ib"
      aria-label="Undo"
      disabled={!tool.canUndo}
      onclick={() => tool.undo()}><Icon name="undo" /></button
    >
    <button
      type="button"
      class="ph-ib"
      aria-label="Redo"
      disabled={!tool.canRedo}
      onclick={() => tool.redo()}><Icon name="redo" /></button
    >
    <button
      type="button"
      class="ph-ib"
      aria-label="Copy share link"
      disabled={!tool.ready}
      onclick={copyShareLink}><Icon name="link" /></button
    >
  </header>

  <main class="area" class:split={view !== 'canvas'}>
    <div class="figure"><Canvas /></div>
    {#if view === 'canvas'}
      {#if layer}
        <section class="context" aria-label={`Layer ${tool.layerName(index)}`}>
          <div class="head">
            <b>{tool.layerName(index)}</b>{#if activation}<span class="muted">{activation}</span
              >{/if}
            <button
              type="button"
              class="ph-ib close"
              aria-label="Deselect layer"
              onclick={() => tool.select({ kind: 'diagram' })}
              ><Icon name="close" size={18} /></button
            >
          </div>
          <div class="actions">
            {#if count}
              <span class="ph-stepper">
                <button
                  type="button"
                  class="ph-ib"
                  aria-label={`Fewer ${count.noun}`}
                  disabled={count.value <= 1}
                  onclick={() => step(-1)}><Icon name="minus" /></button
                >
                <span class="ph-value value" aria-live="polite">{count.value}</span>
                <button
                  type="button"
                  class="ph-ib"
                  aria-label={`More ${count.noun}`}
                  onclick={() => step(1)}><Icon name="plus" /></button
                >
              </span>
            {:else}
              <span class="muted shape"
                >{tool.shapes[index] ? shapeText(tool.shapes[index]) : ''}</span
              >
            {/if}
            <span class="grow"></span>
            <button
              type="button"
              class="ph-ib"
              aria-label="Edit layer details"
              onclick={() => (sheet = 'details')}><Icon name="edit" /></button
            >
            <button
              type="button"
              class="ph-ib"
              aria-label="Move layer left"
              disabled={index <= 0}
              onclick={() => tool.moveSelectedLayer(-1)}><Icon name="left" /></button
            >
            <button
              type="button"
              class="ph-ib"
              aria-label="Move layer right"
              disabled={index >= (tool.model?.layers.length ?? 0) - 1}
              onclick={() => tool.moveSelectedLayer(1)}><Icon name="right" /></button
            >
            <button
              type="button"
              class="ph-ib"
              aria-label="Remove layer"
              disabled={(tool.model?.layers.length ?? 0) <= 1}
              onclick={() => tool.removeSelectedLayer()}><Icon name="trash" /></button
            >
          </div>
        </section>
      {/if}
    {:else if view === 'layers'}
      <LayerCards onDetails={() => (sheet = 'details')} />
    {:else if view === 'source'}
      <div class="source"><SourceEditor bind:this={source} rows={7} /></div>
      <div class="symbols" role="toolbar" aria-label="Insert symbols">
        {#each SYMBOLS as symbol (symbol)}
          <button
            type="button"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => source?.insert(symbol)}>{symbol.trim() || symbol}</button
          >
        {/each}
      </div>
    {:else}
      <ShorthandPad />
    {/if}
  </main>

  <nav class="commandbar" aria-label="Editor">
    <button type="button" class="picker" onclick={() => openCommands()}
      >{commandTab}<Icon name="chevron" size={16} /></button
    >
    <button
      type="button"
      class="ph-ib"
      aria-label="Add layer"
      disabled={!tool.valid}
      onclick={() => tool.addLayer()}><Icon name="plus" /></button
    >
    {#each VIEWS as [id, icon, label] (id)}
      <button
        type="button"
        class="ph-ib"
        aria-label={label}
        aria-pressed={view === id}
        onclick={() => (view = id)}><Icon name={icon} /></button
      >
    {/each}
    <button type="button" class="ph-ib" aria-label="All commands" onclick={() => openCommands()}
      ><Icon name="commands" /></button
    >
  </nav>

  <p class="ph-toast" role="status" aria-live="polite">{tool.notice}</p>

  {#if sheet === 'commands'}
    <Sheet label="Commands" tall onclose={() => (sheet = undefined)}>
      <CommandSheet
        bind:tab={commandTab}
        onFiles={() => {
          sheet = undefined;
          onFiles();
        }}
        onDone={() => (sheet = undefined)}
      />
    </Sheet>
  {:else if sheet === 'details'}
    <Sheet label={layer ? tool.layerName(index) : 'Diagram'} onclose={() => (sheet = undefined)}>
      <FormatPane />
    </Sheet>
  {/if}
</div>

<style>
  .editor {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg);
  }

  .area {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .figure {
    display: grid;
    flex: 1;
    min-height: 0;
  }

  .area.split .figure {
    flex: none;
    height: 30%;
    min-height: 150px;
    border-bottom: 1px solid var(--line);
  }

  .context {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 10px;
    padding: 6px 8px 8px 14px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .head b {
    font-size: 0.95rem;
  }

  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .close {
    margin-left: auto;
  }

  .actions {
    display: flex;
    align-items: center;
  }

  .grow {
    flex: 1;
  }

  .value {
    display: inline-grid;
    place-items: center;
  }

  .source {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .symbols {
    display: flex;
    gap: 6px;
    padding: 8px;
    overflow-x: auto;
    border-top: 1px solid var(--line);
    background: var(--surface-2);
  }

  .symbols button {
    min-width: 40px;
    min-height: 40px;
    padding: 0 10px;
    flex: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    font: 600 0.85rem var(--font-mono);
    white-space: pre;
  }

  .commandbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--line);
    background: var(--surface);
  }

  .picker {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    margin-right: auto;
    padding: 0 12px;
    border: 0;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--ink);
    font: 600 0.9rem var(--font-sans);
  }
</style>
