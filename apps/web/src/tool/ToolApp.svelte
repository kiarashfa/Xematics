<script lang="ts">
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import Canvas from './components/Canvas.svelte';
  import EmbedDialog from './components/EmbedDialog.svelte';
  import ExportOptions from './components/ExportOptions.svelte';
  import FormatPane from './components/FormatPane.svelte';
  import FormulaBar from './components/FormulaBar.svelte';
  import Navigator from './components/Navigator.svelte';
  import PhoneTool from './components/PhoneTool.svelte';
  import Ribbon from './components/Ribbon.svelte';
  import SourceEditor from './components/SourceEditor.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TitleBar from './components/TitleBar.svelte';
  import { loadEngine } from './engine.ts';
  import { tool } from './state.svelte.ts';
  import { browserStore } from './storage.ts';

  let { home }: { home: string } = $props();
  const phone = new MediaQuery('max-width: 760px');
  let source: SourceEditor | undefined = $state();

  const columns = $derived(
    [
      tool.showNavigator ? 'minmax(240px, 300px)' : '',
      'minmax(0, 1fr)',
      tool.showFormat ? 'minmax(220px, 270px)' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  onMount(() => {
    // Narrow windows give the canvas more room; the View tab brings the format pane back.
    if (innerWidth < 1100) tool.showFormat = false;
    loadEngine().then(
      (engine) => (tool.engine = engine),
      (error: unknown) =>
        (tool.engineError = error instanceof Error ? error.message : String(error)),
    );
    // A share link is opened once; afterwards the address no longer carries the old diagram.
    const fragment = location.hash;
    tool.init(browserStore, fragment).then(() => {
      if (fragment) history.replaceState(null, '', location.pathname + location.search);
    });
    // Warn before leaving only while a save is pending or storage is blocked.
    const guard = (event: BeforeUnloadEvent) => {
      if (tool.saveStatus !== 'saved') event.preventDefault();
    };
    addEventListener('beforeunload', guard);
    return () => removeEventListener('beforeunload', guard);
  });

  // Fonts and formulas load on demand; the preview redraws when they arrive.
  $effect(() => {
    void tool.model;
    void tool.engine;
    void tool.prepareText();
  });

  // Autosave whenever any document or setting changes.
  $effect(() => {
    void JSON.stringify(tool.documents);
    void tool.currentId;
    void tool.liveText;
    void tool.exportFormat;
    void tool.pngDpi;
    void tool.tikzStandalone;
    tool.scheduleSave();
  });

  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    // Form fields keep their own native undo; the source editor handles its own keys.
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) tool.redo();
      else tool.undo();
    } else if (key === 'y') {
      event.preventDefault();
      tool.redo();
    }
  }

  function revealFirstError() {
    const first = tool.errors[0];
    if (first) source?.reveal(first);
  }
</script>

<svelte:window onkeydown={onKey} />

{#if phone.current}
  <PhoneTool {home} />
{:else}
  <div class="tool">
    <TitleBar {home} />
    <Ribbon />
    <FormulaBar />
    <div class="body" style:grid-template-columns={columns}>
      {#if tool.showNavigator}
        <div class="left">
          <Navigator />
          <SourceEditor bind:this={source} />
        </div>
      {/if}
      <Canvas />
      {#if tool.showFormat}
        <div class="right"><FormatPane /></div>
      {/if}
    </div>
    <StatusBar onReveal={revealFirstError} />
  </div>
{/if}

{#if tool.dialog === 'export-options'}
  <ExportOptions />
{:else if tool.dialog === 'embed'}
  <EmbedDialog />
{/if}

<style>
  .tool {
    display: grid;
    /* minmax(0, 1fr): the wide ribbon scrolls inside its own row instead of widening the page. */
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    height: 100dvh;
  }

  .body {
    display: grid;
    min-height: 0;
  }

  .left,
  .right {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--surface);
    overflow: auto;
  }

  .left {
    border-right: 1px solid var(--line);
  }

  .right {
    border-left: 1px solid var(--line);
  }
</style>
