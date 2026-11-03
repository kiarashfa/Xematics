<script lang="ts">
  import { embedSnippets, renderScene, type EmbedSnippets } from '@xematics/core';
  import { copyText } from '../browser.ts';
  import { tool } from '../state.svelte.ts';
  import Dialog from './Dialog.svelte';

  const close = () => (tool.dialog = undefined);
  let snippets = $state<(EmbedSnippets & { svg: string }) | undefined>();
  let copied = $state('');

  // Embedded figures use outlined text: an <img> cannot load fonts from inside the SVG reliably.
  $effect(() => {
    void tool.exportScene().then(async (ready) => {
      if (!ready) return;
      const svg = await renderScene(ready.scene, ready.engine);
      snippets = { ...embedSnippets(svg, ready.scene.description, ready.scene), svg };
    });
  });

  const KINDS = [
    { key: 'markdown', label: 'Markdown', hint: 'For README files, notes and wikis.' },
    { key: 'html', label: 'HTML', hint: 'An <img> tag for web pages and blogs.' },
    { key: 'dataUrl', label: 'Data URL', hint: 'The image itself, for any src or url().' },
    { key: 'svg', label: 'SVG code', hint: 'The figure as markup, to paste inline.' },
  ] as const;

  async function copy(label: string, text: string) {
    copied = (await copyText(text)) ? `${label} copied.` : 'Copying is blocked in this browser.';
  }
</script>

<Dialog title="Embed code" onclose={close}>
  {#if !snippets}
    <p>Preparing the figure...</p>
  {:else}
    {#each KINDS as kind (kind.key)}
      {@const text = snippets[kind.key]}
      <div class="kind">
        <div class="head">
          <label for={`embed-${kind.key}`}>{kind.label}</label>
          <button type="button" class="action" onclick={() => copy(kind.label, text)}
            >{`Copy ${kind.label}`}</button
          >
        </div>
        <textarea
          id={`embed-${kind.key}`}
          readonly
          rows="2"
          aria-describedby={`embed-${kind.key}-hint`}>{text}</textarea
        >
        <small id={`embed-${kind.key}-hint`}>{kind.hint}</small>
      </div>
    {/each}
    <p class="status" role="status" aria-live="polite">{copied}</p>
  {/if}
</Dialog>

<style>
  .kind {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  label {
    font-weight: 600;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--bg);
    color: var(--ink);
    font: 0.75rem var(--font-mono);
    resize: vertical;
    word-break: break-all;
  }

  small {
    color: var(--muted);
  }

  .status {
    min-height: 1.2em;
    margin: 0;
    color: var(--muted);
  }
</style>
