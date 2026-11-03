<script lang="ts" module>
  export const COMMAND_TABS = ['File', 'Home', 'Export', 'View'] as const;
  export type CommandTab = (typeof COMMAND_TABS)[number];
</script>

<script lang="ts">
  import {
    copyShareLink,
    copySvg,
    downloadSource,
    exportSvg,
    openSourceFile,
    openWorkspaceFile,
    saveWorkspace,
  } from '../../actions.ts';
  import { PRESET_IDS, PRESET_NAMES } from '@xematics/core';
  import { currentTheme, setTheme } from '../../browser.ts';
  import { tool } from '../../state.svelte.ts';
  import Icon, { type IconName } from '../Icon.svelte';
  import PresetThumb from '../PresetThumb.svelte';

  // The desktop ribbon as large touch rows, one tab at a time (like Office on phones).
  let {
    tab = $bindable(),
    onFiles,
    onDone,
  }: { tab: CommandTab; onFiles: () => void; onDone: () => void } = $props();
  let theme = $state(currentTheme());
  let sourceInput: HTMLInputElement | undefined = $state();
  let workspaceInput: HTMLInputElement | undefined = $state();

  const index = $derived(tool.selection.kind === 'layer' ? tool.selection.index : -1);
  const count = $derived(tool.model?.layers.length ?? 0);

  function run(action: () => unknown) {
    action();
    onDone();
  }

  function step(key: 'above' | 'first' | 'last', delta: number) {
    const value = tool.collapse[key] + delta;
    if (value >= (key === 'above' ? 1 : 0) && value <= (key === 'above' ? 1_000_000 : 100))
      tool.setCollapse(key, value);
  }

  async function onFile(event: Event, action: (file: File) => Promise<void>) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      await action(file);
      onDone();
    }
  }
</script>

{#snippet row(icon: IconName, label: string, action: () => unknown, disabled = false)}
  <li>
    <button type="button" class="ph-row" onclick={() => run(action)} {disabled}
      ><Icon name={icon} /><span class="ph-label">{label}</span></button
    >
  </li>
{/snippet}

{#snippet toggle(icon: IconName, label: string, checked: boolean, change: (on: boolean) => void)}
  <li>
    <label class="ph-row">
      <Icon name={icon} /><span class="ph-label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        {checked}
        onchange={(e) => change(e.currentTarget.checked)}
      />
      <span class="ph-switch" aria-hidden="true"></span>
    </label>
  </li>
{/snippet}

{#snippet stepper(label: string, key: 'above' | 'first' | 'last')}
  <li class="ph-row static">
    <Icon name="layers" /><span class="ph-label">{label}</span>
    <span class="ph-stepper">
      <button
        type="button"
        class="ph-ib"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={tool.preset === 'boxes'}
        onclick={() => step(key, -1)}><Icon name="minus" /></button
      >
      <span class="ph-value value" aria-live="polite">{tool.collapse[key]}</span>
      <button
        type="button"
        class="ph-ib"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={tool.preset === 'boxes'}
        onclick={() => step(key, 1)}><Icon name="plus" /></button
      >
    </span>
  </li>
{/snippet}

<div class="tabs" role="tablist" aria-label="Command groups">
  {#each COMMAND_TABS as t (t)}
    <button type="button" role="tab" aria-selected={tab === t} onclick={() => (tab = t)}>{t}</button
    >
  {/each}
</div>

<div role="tabpanel" aria-label={tab}>
  <ul class="ph-rows">
    {#if tab === 'File'}
      {@render row('file', 'New diagram', () => tool.newDocument())}
      {@render row('cards', 'All documents', onFiles)}
      <li class="ph-rule" aria-hidden="true"></li>
      <li>
        <button type="button" class="ph-row" onclick={() => sourceInput?.click()}
          ><Icon name="open" /><span class="ph-label">Open a diagram file</span></button
        >
      </li>
      {@render row('download', 'Save source', downloadSource)}
      <li class="ph-rule" aria-hidden="true"></li>
      <li>
        <button type="button" class="ph-row" onclick={() => workspaceInput?.click()}
          ><Icon name="open" /><span class="ph-label">Open workspace</span></button
        >
      </li>
      {@render row('download', 'Save workspace', saveWorkspace)}
    {:else if tab === 'Home'}
      {@render row('plus', 'Add layer', () => tool.addLayer(), !tool.valid)}
      {@render row(
        'trash',
        'Remove layer',
        () => tool.removeSelectedLayer(),
        index < 0 || count <= 1,
      )}
      {@render row('left', 'Move layer left', () => tool.moveSelectedLayer(-1), index <= 0)}
      {@render row(
        'right',
        'Move layer right',
        () => tool.moveSelectedLayer(1),
        index < 0 || index >= count - 1,
      )}
      <li class="ph-rule" aria-hidden="true"></li>
      <li>
        <div class="presets" role="group" aria-label="Preset">
          {#each PRESET_IDS as id (id)}
            <button
              type="button"
              class="preset"
              aria-pressed={tool.preset === id}
              onclick={() => tool.setPreset(id)}
            >
              <PresetThumb {id} />
              <span>{PRESET_NAMES[id]}</span>
            </button>
          {/each}
        </div>
      </li>
      {@render toggle('tag', 'Layer names', tool.labels.names, (on) => tool.setLabel('names', on))}
      {@render toggle('tag', 'Neuron counts', tool.labels.sizes, (on) =>
        tool.setLabel('sizes', on),
      )}
      {@render toggle('canvas', 'Transparent background', tool.transparent, (on) =>
        tool.setTransparent(on),
      )}
      <li class="ph-rule" aria-hidden="true"></li>
      {@render stepper('Collapse above', 'above')}
      {@render stepper('Show first', 'first')}
      {@render stepper('Show last', 'last')}
    {:else if tab === 'Export'}
      {@render row('download', 'Save SVG', exportSvg, !tool.layout)}
      {@render row('copy', 'Copy SVG', copySvg, !tool.layout)}
      {@render row('link', 'Copy share link', copyShareLink, !tool.ready)}
      {@render toggle(
        'edit',
        'Editable text in the SVG',
        tool.liveText,
        (on) => (tool.liveText = on),
      )}
    {:else}
      {@render row('fit', 'Fit to screen', () => (tool.zoom = 'fit'))}
      {@render row('plus', 'Zoom in', () => tool.zoomBy(1.25))}
      {@render row('minus', 'Zoom out', () => tool.zoomBy(0.8))}
      {@render toggle('moon', 'Dark theme', theme === 'dark', (on) => {
        theme = on ? 'dark' : 'light';
        setTheme(theme);
      })}
    {/if}
  </ul>
</div>

<input
  bind:this={sourceInput}
  type="file"
  accept=".yaml,.yml,.json,.txt"
  hidden
  onchange={(e) => onFile(e, openSourceFile)}
/>
<input
  bind:this={workspaceInput}
  type="file"
  accept=".json"
  hidden
  onchange={(e) => onFile(e, openWorkspaceFile)}
/>

<style>
  .tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 4px 0 6px;
  }

  .tabs button {
    min-height: 36px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font: 600 0.9rem var(--font-sans);
  }

  .tabs button[aria-selected='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }

  .presets {
    display: flex;
    gap: 8px;
    padding: 4px 2px 8px;
    overflow-x: auto;
  }

  .preset {
    display: grid;
    flex: none;
    place-items: center;
    gap: 4px;
    width: 84px;
    min-height: 72px;
    padding: 6px 4px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    color: var(--ink);
    font: 0.72rem var(--font-sans);
  }

  .preset[aria-pressed='true'] {
    border-color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }

  .static {
    cursor: default;
  }

  .value {
    display: inline-grid;
    place-items: center;
  }
</style>
