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
  import Manual from './components/Manual.svelte';
  import Ribbon from './components/Ribbon.svelte';
  import SourceEditor from './components/SourceEditor.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TitleBar from './components/TitleBar.svelte';
  import { chooseSourceFile, exportAs } from './actions.ts';
  import { loadEngine } from './engine.ts';
  import { tool } from './state.svelte.ts';
  import { CHANGED_KEY, cloudState, onLocalChange } from '../user/local.ts';
  import { browserStore } from '../user/store.ts';
  import { visitor } from '../user/visitor.svelte.ts';

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
    visitor.start();
    loadEngine().then(
      (engine) => (tool.engine = engine),
      (error: unknown) =>
        (tool.engineError = error instanceof Error ? error.message : String(error)),
    );
    // A share link is opened once; afterwards the address no longer carries the old diagram.
    const fragment = location.hash;
    // ?doc=<id> opens a document and ?new starts one (links from the profile gallery).
    const params = new URLSearchParams(location.search);
    const openId = params.get('doc');
    tool.init(browserStore, fragment, openId).then(() => {
      if (params.has('new')) {
        tool.newDocument();
        tool.openedFromLink = true;
      }
      if (fragment || openId || params.has('new'))
        history.replaceState(null, '', location.pathname);
    });
    // Saves from another tab, a save file or the cloud reach the open editor. Signing out in
    // another tab empties the save: the editor starts over instead of saving its copy back.
    let reading = false;
    const signedOut = (event: StorageEvent) => {
      if (event.key === CHANGED_KEY && event.newValue === null) location.reload();
    };
    addEventListener('storage', signedOut);
    const offChanges = onLocalChange(() => {
      if (reading || !tool.ready) return;
      reading = true;
      void browserStore
        .load()
        .then((workspace) => workspace && tool.absorb(workspace))
        .catch(() => {})
        .finally(() => (reading = false));
    });
    // With a cloud save connected, the editor keeps it up to date (the code loads only then).
    if (cloudState()) void import('../user/cloud.ts').then((cloud) => cloud.startAutoSave());
    // Warn before leaving only while a save is pending or storage is blocked.
    const guard = (event: BeforeUnloadEvent) => {
      if (tool.saveStatus !== 'saved') event.preventDefault();
    };
    addEventListener('beforeunload', guard);
    return () => {
      removeEventListener('beforeunload', guard);
      removeEventListener('storage', signedOut);
      offChanges();
    };
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

  /**
   * Editor shortcuts. Ctrl (or Cmd) with S, O and E work everywhere; the others only outside text
   * fields, which keep their own keys (the source editor handles undo itself).
   */
  function onKey(event: KeyboardEvent) {
    if (tool.dialog || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    const inField = target.closest('input, textarea, select, [contenteditable]') !== null;
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const run = (action: () => unknown) => {
      event.preventDefault();
      void action();
    };
    if (ctrl && !event.altKey && !event.shiftKey) {
      if (key === 's') return run(() => tool.saveNow());
      if (key === 'o') return run(chooseSourceFile);
      if (key === 'e') return run(() => tool.layout && exportAs(tool.exportFormat));
    }
    if (inField) return;
    if (ctrl && key === 'z') return run(() => (event.shiftKey ? tool.redo() : tool.undo()));
    if (ctrl && key === 'y') return run(() => tool.redo());
    if (ctrl && key === 'enter') return run(() => tool.valid && tool.addLayer());
    if (ctrl) return;
    const layer = tool.selection.kind === 'layer' ? tool.selection.index : -1;
    const count = tool.model?.layers.length ?? 0;
    if (event.altKey) {
      if (key === 'arrowup' && layer > 0) return run(() => tool.moveSelectedLayer(-1));
      if (key === 'arrowdown' && layer >= 0 && layer < count - 1)
        return run(() => tool.moveSelectedLayer(1));
      return;
    }
    if (key === 'insert') return run(() => tool.valid && tool.addLayer());
    if (key === 'delete' && layer >= 0 && count > 1) return run(() => tool.removeSelectedLayer());
    if (key === 'escape' && layer >= 0) return run(() => tool.select({ kind: 'diagram' }));
    // Space plays and pauses the animation, unless a button has focus (Space presses it).
    if (key === ' ' && tool.playerOpen && !target.closest('button, a, [role="tab"]'))
      return run(() => (tool.playing = !tool.playing));
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
        <div class="right">
          {#if tool.manual}<Manual />{:else}<FormatPane />{/if}
        </div>
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
