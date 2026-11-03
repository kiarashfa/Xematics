<script lang="ts">
  import { pngSize } from '@xematics/core';
  import { MAX_PNG_PIXELS, PNG_SIZES } from '../formats.ts';
  import { tool } from '../state.svelte.ts';
  import Dialog from './Dialog.svelte';

  const close = () => (tool.dialog = undefined);
  const figure = $derived(tool.layout?.scene);
  const pixels = (dpi: number) => (figure ? pngSize(figure, dpi) : undefined);
</script>

<Dialog title="Export options" onclose={close}>
  <fieldset>
    <legend>SVG text</legend>
    <label
      ><input
        type="radio"
        name="svg-text"
        checked={!tool.liveText}
        onchange={() => (tool.liveText = false)}
      />Outlined: looks identical everywhere</label
    >
    <label
      ><input
        type="radio"
        name="svg-text"
        checked={tool.liveText}
        onchange={() => (tool.liveText = true)}
      />Editable text, with its fonts embedded</label
    >
  </fieldset>

  <fieldset>
    <legend>PNG size</legend>
    <div class="sizes">
      {#each PNG_SIZES as size (size.dpi)}
        {@const px = pixels(size.dpi)}
        <label class="size"
          ><input
            type="radio"
            name="png-size"
            checked={tool.pngDpi === size.dpi}
            disabled={px !== undefined && px.width * px.height > MAX_PNG_PIXELS}
            onchange={() => (tool.pngDpi = size.dpi)}
          /><span>{size.label}</span>{#if px}<small>{`${px.width} x ${px.height} px`}</small
            >{/if}</label
        >
      {/each}
    </div>
    <p class="note">
      The resolution is saved in the file, so 300 and 600 dpi print at the figure's own size.
    </p>
  </fieldset>

  <fieldset>
    <legend>TikZ</legend>
    <label
      ><input
        type="radio"
        name="tikz-form"
        checked={tool.tikzStandalone}
        onchange={() => (tool.tikzStandalone = true)}
      />Standalone document, ready to compile</label
    >
    <label
      ><input
        type="radio"
        name="tikz-form"
        checked={!tool.tikzStandalone}
        onchange={() => (tool.tikzStandalone = false)}
      />Only the tikzpicture, to paste into a paper</label
    >
    <p class="note">
      Math labels stay LaTeX. Persian, Hebrew or CJK labels need XeLaTeX or LuaLaTeX.
    </p>
  </fieldset>

  {#snippet footer()}
    <button type="button" class="action primary" onclick={close}>Done</button>
  {/snippet}
</Dialog>

<style>
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 4px;
    font-weight: 600;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
    cursor: pointer;
  }

  input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--accent);
  }

  .sizes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 4px 12px;
  }

  .size small {
    color: var(--muted);
  }

  .note {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
