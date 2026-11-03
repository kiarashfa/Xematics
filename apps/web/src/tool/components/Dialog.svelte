<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  // A modal built on the native <dialog>: focus moves in, Escape closes, the page behind is inert.
  let {
    title,
    onclose,
    children,
    footer,
  }: { title: string; onclose: () => void; children: Snippet; footer?: Snippet } = $props();

  const open = (dialog: HTMLDialogElement) => {
    dialog.showModal();
    return () => dialog.close();
  };
</script>

<dialog
  class="dialog"
  aria-labelledby="dialog-title"
  {@attach open}
  {onclose}
  onclick={(e) => {
    // A click on the backdrop (the dialog element itself) closes it.
    if (e.target === e.currentTarget) onclose();
  }}
>
  <div class="frame">
    <header>
      <h2 id="dialog-title">{title}</h2>
      <button type="button" class="close" aria-label="Close" onclick={onclose}
        ><Icon name="close" size={16} /></button
      >
    </header>
    <div class="content">{@render children()}</div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
  </div>
</dialog>

<style>
  .dialog {
    /* The site's reset removes the native centering margins. */
    margin: auto;
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.3);
  }

  .dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }

  .frame {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px 16px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--ink);
    cursor: pointer;
  }

  .close:hover {
    background: var(--surface-2);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-size: 0.875rem;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  :global(.dialog .action) {
    min-height: 32px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--bg);
    color: var(--ink);
    font: 0.85rem var(--font-sans);
    cursor: pointer;
  }

  :global(.dialog .action.primary) {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }
</style>
