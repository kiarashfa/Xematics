<script lang="ts">
  import { isTikzFont, pngSize } from '@xematics/core';
  import { MAX_PNG_PIXELS, PNG_SIZES } from '../formats.ts';
  import { tool } from '../state.svelte.ts';
  import Dialog from './Dialog.svelte';

  const close = () => (tool.dialog = undefined);
  const figure = $derived(tool.layout?.scene);
  const pixels = (dpi: number) => (figure ? pngSize(figure, dpi) : undefined);
  let fontBad = $state(false);
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
    <label class="font"
      >Font for Persian, Hebrew or CJK labels <input
        type="text"
        class="text"
        placeholder="Automatic"
        spellcheck="false"
        maxlength="64"
        value={tool.tikzFont}
        aria-invalid={fontBad}
        oninput={(e) => {
          const name = e.currentTarget.value.trim();
          fontBad = name !== '' && !isTikzFont(name);
          if (!fontBad) tool.tikzFont = name;
        }}
      /></label
    >
    <p class="note">
      {fontBad
        ? 'Use letters, digits, spaces, dots, dashes or underscores.'
        : 'Math labels stay LaTeX. Persian, Hebrew or CJK labels need LuaLaTeX or XeLaTeX; Automatic uses Vazirmatn, Noto Sans Hebrew or Noto Sans SC, JP or KR.'}
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

  .font {
    flex-wrap: wrap;
    cursor: default;
  }

  .text {
    flex: 1 1 160px;
    width: auto;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--field, transparent);
    color: inherit;
    font: inherit;
  }

  .text[aria-invalid='true'] {
    border-color: var(--danger, #c0392b);
  }

  .note {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
