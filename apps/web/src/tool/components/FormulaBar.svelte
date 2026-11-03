<script lang="ts">
  import { tool } from '../state.svelte.ts';
  import Icon from './Icon.svelte';

  // Like a spreadsheet formula bar: layer sizes and activations as shorthand. Edits keep every
  // other per-layer setting (names, collapse) because layers are matched by position.
  let draft = $state(tool.structure);
  let focused = $state(false);
  let error = $state('');

  $effect(() => {
    const structure = tool.structure;
    if (!focused) draft = structure;
  });

  function onInput() {
    if (draft.trim() === '') return;
    const problems = tool.setStructure(draft);
    error = problems[0] ? `Column ${problems[0].column ?? 1}: ${problems[0].message}` : '';
  }

  function onBlur() {
    focused = false;
    draft = tool.structure;
    error = '';
  }
</script>

<div class="bar">
  <label class="fx" for="structure-input" title="Layer sizes and activations">fx</label>
  <input
    id="structure-input"
    class="structure"
    bind:value={draft}
    oninput={onInput}
    onfocus={() => (focused = true)}
    onblur={onBlur}
    onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    spellcheck="false"
    autocomplete="off"
    aria-label="Layer sizes, for example 784-16-16-10"
    aria-invalid={error ? 'true' : undefined}
    aria-describedby="structure-status"
  />
  <span id="structure-status" class="status" class:bad={!!error || !tool.valid} aria-live="polite">
    {#if error}
      <Icon name="alert" size={15} />{error}
    {:else if tool.valid}
      <Icon name="check" size={15} />Valid
    {:else}
      <Icon name="alert" size={15} />Source has errors
    {/if}
  </span>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    min-width: 0;
  }

  .fx {
    padding-right: 10px;
    border-right: 1px solid var(--line);
    color: var(--muted);
    font: italic 600 0.85rem var(--font-sans);
  }

  .structure {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 500 0.9rem var(--font-mono);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 45%;
    font-size: 0.8rem;
    color: light-dark(#1f7a4d, #6fd3a0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status.bad {
    color: light-dark(#b42318, #ff9b8f);
  }
</style>
