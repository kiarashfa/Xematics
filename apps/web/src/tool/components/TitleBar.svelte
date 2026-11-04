<script lang="ts">
  import wordmark from '../../assets/wordmark.svg?raw';
  import Avatar from '../../user/Avatar.svelte';
  import { PROVIDERS } from '../../user/local.ts';
  import { visitor } from '../../user/visitor.svelte.ts';
  import { copyShareLink } from '../actions.ts';
  import { tool } from '../state.svelte.ts';
  import Icon from './Icon.svelte';

  let { home }: { home: string } = $props();

  const where = $derived(visitor.cloud ? PROVIDERS[visitor.cloud.provider] : '');
  const saveLabel = $derived.by(() => {
    if (tool.saveStatus === 'error') return 'Not saved: browser storage is blocked';
    if (!visitor.cloud) return tool.saveStatus === 'saving' ? 'Saving…' : 'Saved in this browser';
    if (tool.saveStatus === 'saving' || visitor.sync === 'saving') return `Saving to ${where}…`;
    return `Saved to ${where}`;
  });
  /** With changes waiting for Google's sign-in (or a failed save), the label becomes a button. */
  const needsClick = $derived(
    !!visitor.cloud &&
      visitor.sync !== 'saving' &&
      (visitor.dot === 'pending' || visitor.dot === 'auth'),
  );

  async function saveNow() {
    const cloud = await import('../../user/cloud.ts');
    try {
      await cloud.sync({ interactive: true });
    } catch (error) {
      tool.flash(error instanceof Error ? error.message : 'Saving to the cloud failed.');
    }
  }
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
  {#if needsClick}
    <button type="button" class="saved retry" onclick={saveNow}
      >{visitor.dot === 'auth' ? `Sign in to ${where} again` : `Save to ${where}`}</button
    >
  {:else}
    <span
      class="saved"
      title={visitor.cloud
        ? `Every change is saved in this browser and in your ${where}.`
        : "Clearing this browser's site data removes autosaved work. Download the save file or connect a cloud save on your profile to keep a copy."}
      >{saveLabel}</span
    >
  {/if}
  <button
    type="button"
    class="icon"
    aria-label="Copy share link"
    title="Copy share link"
    disabled={!tool.ready}
    onclick={copyShareLink}><Icon name="link" size={16} /></button
  >
  <a class="me" href={`${home}user/`} aria-label="Your profile" title="Your profile"
    ><Avatar profile={visitor.profile} size={24} dot={visitor.dot} /></a
  >
  <!-- Work is autosaved, so closing simply returns to the site. -->
  <a class="icon close" href={home} aria-label="Close the editor" title="Close the editor"
    ><Icon name="close" size={16} /></a
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

  .close {
    margin-left: 4px;
    text-decoration: none;
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

  .retry {
    padding: 3px 9px;
    border: 1px solid currentColor;
    border-radius: 2px;
    background: none;
    color: inherit;
    font: inherit;
    opacity: 1;
    cursor: pointer;
  }

  .me {
    display: inline-grid;
    margin-left: 6px;
    border-radius: 50%;
  }

  .me :global(.avatar-dot) {
    border-color: var(--accent);
  }
</style>
