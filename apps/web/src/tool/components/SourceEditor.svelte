<script lang="ts">
  import type { Diagnostic } from '@xematics/core';
  import { tool } from '../state.svelte.ts';

  let { rows = 10 }: { rows?: number } = $props();
  let textarea: HTMLTextAreaElement | undefined = $state();
  let gutter: HTMLDivElement | undefined = $state();

  const lineCount = $derived(tool.text.split('\n').length);
  const formatLabel = $derived(
    { shorthand: 'Shorthand', yaml: 'YAML', json: 'JSON' }[tool.parsed.format],
  );
  const problems = $derived([...tool.errors, ...tool.warnings]);

  function onKey(event: KeyboardEvent) {
    // One undo history for text and form edits.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) tool.redo();
      else tool.undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      tool.redo();
    }
  }

  /** Inserts text at the caret, as if typed (used by the phone symbol bar). */
  export function insert(text: string) {
    if (!textarea) return;
    textarea.focus();
    textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
    tool.setText(textarea.value, true);
  }

  /** Moves the caret to a diagnostic's position. */
  export function reveal(d: Diagnostic) {
    if (!textarea || d.line === undefined) return;
    const lines = tool.text.split('\n');
    let offset = 0;
    for (let i = 0; i < d.line - 1 && i < lines.length; i++) offset += (lines[i]?.length ?? 0) + 1;
    offset += (d.column ?? 1) - 1;
    textarea.focus();
    textarea.setSelectionRange(offset, offset);
  }
</script>

<section class="source" aria-labelledby="source-heading">
  <div class="head">
    <h2 id="source-heading" class="label-caps">Source</h2>
    <span class="format">{formatLabel}</span>
  </div>
  <div class="editor">
    <div class="gutter" bind:this={gutter} aria-hidden="true">
      {#each { length: lineCount }, i (i)}<div>{i + 1}</div>{/each}
    </div>
    <textarea
      bind:this={textarea}
      value={tool.text}
      oninput={(e) => tool.setText(e.currentTarget.value, true)}
      onkeydown={onKey}
      onscroll={() => gutter && textarea && (gutter.scrollTop = textarea.scrollTop)}
      {rows}
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      aria-labelledby="source-heading"
      aria-describedby="source-problems"
      aria-invalid={tool.valid ? undefined : 'true'}></textarea>
  </div>
  <ul id="source-problems" class="problems" aria-live="polite">
    {#each problems as d, i (i)}
      <li class={d.severity}>
        <button type="button" onclick={() => reveal(d)} disabled={d.line === undefined}>
          {#if d.line !== undefined}<span class="pos">{`${d.line}:${d.column ?? 1} `}</span
            >{/if}{d.message}
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .source {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    padding: 6px 10px 10px;
    border-top: 1px solid var(--line);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 4px 6px 6px;
  }

  h2 {
    margin: 0;
    color: var(--muted);
    font-size: 0.68rem;
  }

  .format {
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--muted);
    font-size: 0.68rem;
    font-weight: 600;
  }

  .editor {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 120px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .gutter,
  textarea {
    font: 0.8rem/1.7 var(--font-mono);
    padding: 8px 0;
  }

  .gutter {
    width: 34px;
    flex: none;
    overflow: hidden;
    color: var(--muted);
    opacity: 0.7;
    text-align: right;
    padding-right: 8px;
    user-select: none;
  }

  textarea {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    resize: none;
    padding-left: 4px;
    padding-right: 8px;
    white-space: pre;
    overflow: auto;
    outline: none;
  }

  .editor:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }

  .problems {
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    max-height: 9em;
    overflow: auto;
  }

  .problems button {
    display: block;
    min-height: 24px;
    width: 100%;
    padding: 4px 6px;
    border: 0;
    background: none;
    color: inherit;
    font: 0.8rem/1.4 var(--font-sans);
    text-align: left;
    cursor: pointer;
  }

  .problems .error {
    color: light-dark(#b42318, #ff9b8f);
  }

  .problems .warning {
    color: light-dark(#8a5a00, #f2c46d);
  }

  .pos {
    margin-right: 8px;
    font-family: var(--font-mono);
  }
</style>
