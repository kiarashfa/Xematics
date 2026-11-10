<script lang="ts">
  import { tool } from '../state.svelte.ts';
  import Dialog from './Dialog.svelte';

  // The figure's description (alt text), from the File tab's Properties group.
  let text = $state(tool.model?.description ?? '');
  const close = () => (tool.dialog = undefined);

  function save() {
    tool.setDescription(text);
    close();
  }
</script>

<Dialog title="Description" onclose={close}>
  <p class="hint">
    Alternative text for the figure, read by screen readers and kept in every SVG. Leave it empty to
    use the generated one.
  </p>
  <label class="field">
    <span>Description (alt text)</span>
    <textarea rows="6" bind:value={text} placeholder={tool.layout?.scene.description ?? ''}
    ></textarea>
  </label>
  {#snippet footer()}
    <button type="button" class="plain" onclick={() => (text = '')}>Use the generated text</button>
    <span class="end">
      <button type="button" class="plain" onclick={close}>Cancel</button>
      <button type="button" class="primary" onclick={save}>OK</button>
    </span>
  {/snippet}
</Dialog>

<style>
  .hint {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
    color: var(--muted);
  }

  textarea {
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.9rem var(--font-sans);
    resize: vertical;
  }

  .end {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }

  button {
    min-height: 32px;
    padding: 4px 14px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 500 0.85rem var(--font-sans);
    cursor: pointer;
  }

  .primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }
</style>
