<script lang="ts">
  import wordmark from '../../assets/wordmark.svg?raw';
  import { copyShareLink } from '../actions.ts';
  import { tool } from '../state.svelte.ts';
  import Icon from './Icon.svelte';

  let { home }: { home: string } = $props();
  const saveLabel = $derived(
    {
      saved: 'Saved in this browser',
      saving: 'Saving…',
      error: 'Not saved: browser storage is blocked',
    }[tool.saveStatus],
  );
</script>

<header class="titlebar">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- static wordmark generated at build time -->
  <a class="brand" href={home} aria-label="Xematics home">{@html wordmark}</a>
  <button
    type="button"
    class="icon"
    aria-label="Undo"
    title="Undo (Ctrl+Z)"
    disabled={!tool.canUndo}
    onclick={() => tool.undo()}><Icon name="undo" size={16} /></button
  >
  <button
    type="button"
    class="icon"
    aria-label="Redo"
    title="Redo (Ctrl+Shift+Z)"
    disabled={!tool.canRedo}
    onclick={() => tool.redo()}><Icon name="redo" size={16} /></button
  >
  <h1 class="title">{tool.model?.title || 'Untitled diagram'}</h1>
  <span
    class="saved"
    title="Clearing this browser's site data removes autosaved work. Save the workspace to keep a copy."
    >{saveLabel}</span
  >
  <button
    type="button"
    class="icon"
    aria-label="Copy share link"
    title="Copy share link"
    disabled={!tool.ready}
    onclick={copyShareLink}><Icon name="link" size={16} /></button
  >
</header>

<style>
  .titlebar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.8rem;
    --mark-accent: currentColor;
  }

  .brand {
    display: inline-flex;
    margin-right: 10px;
    color: inherit;
  }

  .brand :global(svg) {
    height: 20px;
    width: auto;
  }

  .icon {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: inherit;
    cursor: pointer;
  }

  .icon:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 15%, transparent);
  }

  .icon:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .title {
    flex: 1;
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .saved {
    opacity: 0.8;
  }
</style>
