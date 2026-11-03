<script lang="ts">
  import { tool } from '../../state.svelte.ts';

  // A calculator-style pad for the layer sizes, so quick figures need no phone keyboard.
  // Valid input applies at once (names and other settings are kept, like the shorthand bar).
  let draft = $state(tool.structure);
  let caret = $state(tool.structure.length);
  let error = $state('');
  let applied = tool.structure;

  // Follow outside changes (undo, form edits) but not our own edits.
  $effect(() => {
    const structure = tool.structure;
    if (structure !== applied) {
      applied = structure;
      draft = structure;
      caret = structure.length;
      error = '';
    }
  });

  const KEYS = [
    ['7', '7'],
    ['8', '8'],
    ['9', '9'],
    ['⌫', 'Backspace'],
    ['4', '4'],
    ['5', '5'],
    ['6', '6'],
    ['−', 'Hyphen, next layer'],
    ['1', '1'],
    ['2', '2'],
    ['3', '3'],
    [':', 'Colon, activation'],
    ['0', '0'],
    ['00', '00'],
    ['←', 'Move left'],
    ['→', 'Move right'],
  ] as const;
  const ACTIVATIONS = ['relu', 'tanh', 'sigmoid', 'softmax', 'gelu'];

  function put(text: string) {
    draft = draft.slice(0, caret) + text + draft.slice(caret);
    caret += text.length;
    apply();
  }

  function press(key: string) {
    if (key === '⌫') {
      if (caret === 0) return;
      draft = draft.slice(0, caret - 1) + draft.slice(caret);
      caret -= 1;
      apply();
    } else if (key === '←') caret = Math.max(0, caret - 1);
    else if (key === '→') caret = Math.min(draft.length, caret + 1);
    else put(key === '−' ? '-' : key);
  }

  function activation(name: string) {
    const before = draft.slice(0, caret);
    if (/\d$/.test(before)) put(`:${name}`);
    else if (before.endsWith(':')) put(name);
    else error = 'Type a layer size first, then pick its activation.';
  }

  function apply() {
    if (draft.trim() === '') {
      error = 'Type at least one layer size.';
      return;
    }
    const problems = tool.setStructure(draft);
    error = problems[0]?.message ?? '';
    applied = tool.structure;
  }
</script>

<div class="pad">
  <output class="display" class:bad={!!error} aria-label="Layer sizes" aria-live="polite"
    ><span>{draft.slice(0, caret)}</span><span class="caret" aria-hidden="true"></span><span
      >{draft.slice(caret)}</span
    ></output
  >
  <p class="error" role="status">{error}</p>
  <div class="acts" role="group" aria-label="Activations">
    {#each ACTIVATIONS as name (name)}
      <button type="button" class="ph-chip" onclick={() => activation(name)}>{name}</button>
    {/each}
  </div>
  <div class="keys">
    {#each KEYS as [key, label] (key)}
      <button type="button" class:op={!/\d/.test(key)} aria-label={label} onclick={() => press(key)}
        >{key}</button
      >
    {/each}
  </div>
</div>

<style>
  .pad {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 8px 14px 10px;
  }

  .display {
    display: flex;
    align-items: center;
    min-height: 50px;
    padding: 0 14px;
    border: 2px solid var(--accent);
    border-radius: 12px;
    background: var(--surface);
    font: 500 1.15rem var(--font-mono);
    overflow-x: auto;
    white-space: pre;
  }

  .display.bad {
    border-color: light-dark(#b42318, #ff9b8f);
  }

  .caret {
    width: 2px;
    height: 1.3em;
    background: var(--accent);
  }

  .error {
    min-height: 1.3em;
    margin: 4px 2px;
    color: light-dark(#b42318, #ff9b8f);
    font-size: 0.8rem;
  }

  .acts {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 8px;
  }

  .keys {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: auto;
  }

  .keys button {
    min-height: 54px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    color: var(--ink);
    font: 600 1.3rem var(--font-mono);
    cursor: pointer;
  }

  .keys button.op {
    background: var(--surface-2);
    color: var(--accent);
  }
</style>
