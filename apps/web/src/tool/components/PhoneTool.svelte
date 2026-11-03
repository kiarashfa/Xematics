<script lang="ts">
  // The phone editor (Office-mobile style): a document list first, then a full-screen figure with
  // a bottom command bar, a contextual layer card, layer cards, source with a symbol bar and a
  // shorthand keypad. Shares all state and commands with the desktop editor.
  import './phone/phone.css';
  import { tool } from '../state.svelte.ts';
  import EditorScreen from './phone/EditorScreen.svelte';
  import FilesScreen from './phone/FilesScreen.svelte';

  let { home }: { home: string } = $props();
  let screen = $state<'files' | 'editor'>('files');
  let height = $state('100dvh');

  // A shared link opens straight into the editor.
  $effect(() => {
    if (tool.openedFromLink) screen = 'editor';
  });

  // Keep the layout above the on-screen keyboard (the visual viewport shrinks when it opens).
  $effect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => (height = `${viewport.height}px`);
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  });

  // The system back gesture returns from the editor to the document list.
  function openEditor() {
    screen = 'editor';
    history.pushState({ xematics: 'editor' }, '');
  }

  function showFiles() {
    if (history.state?.xematics === 'editor') history.back();
    else screen = 'files';
  }

  $effect(() => {
    const onPop = () => (screen = 'files');
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  });
</script>

<div class="phone" style:height>
  {#if screen === 'files'}
    <FilesScreen {home} onOpen={openEditor} />
  {:else}
    <EditorScreen onFiles={showFiles} />
  {/if}
</div>

<style>
  .phone {
    overflow: hidden;
  }
</style>
