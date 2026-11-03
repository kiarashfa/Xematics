<script lang="ts">
  import { SITE } from '../../site.config.ts';
  import {
    copyShareLink,
    copySvg,
    deleteDocument,
    downloadSource,
    exportSvg,
    openSourceFile,
    openWorkspaceFile,
    saveWorkspace,
  } from '../actions.ts';
  import { currentTheme, setTheme } from '../browser.ts';
  import { EXAMPLES, tool } from '../state.svelte.ts';
  import { PRESET_IDS, PRESET_NAMES } from '@xematics/core';
  import Icon, { type IconName } from './Icon.svelte';
  import PresetThumb from './PresetThumb.svelte';

  const TABS = ['File', 'Home', 'View', 'Help'] as const;
  type Tab = (typeof TABS)[number];
  let active = $state<Tab>('Home');
  let theme = $state(currentTheme());
  let sourceInput: HTMLInputElement | undefined = $state();
  let workspaceInput: HTMLInputElement | undefined = $state();

  const layerSelected = $derived(tool.selection.kind === 'layer');
  const layerCount = $derived(tool.model?.layers.length ?? 0);
  const index = $derived(tool.selection.kind === 'layer' ? tool.selection.index : -1);

  function onTabKey(event: KeyboardEvent) {
    const i = TABS.indexOf(active);
    const next = event.key === 'ArrowRight' ? i + 1 : event.key === 'ArrowLeft' ? i - 1 : -2;
    if (next === -2) return;
    event.preventDefault();
    active = TABS[(next + TABS.length) % TABS.length]!;
    document.getElementById(`ribbon-tab-${active}`)?.focus();
  }

  async function onFile(event: Event, open: (file: File) => Promise<void>) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await open(file);
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(theme);
  }

  function setNumber(key: 'above' | 'first' | 'last', event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const value = Number(input.value);
    const [min, max] = key === 'above' ? [1, 1_000_000] : [0, 100];
    if (Number.isInteger(value) && value >= min && value <= max) tool.setCollapse(key, value);
    else input.value = String(tool.collapse[key]);
  }
</script>

{#snippet big(icon: IconName, label: string, action: () => void, disabled = false, primary = false)}
  <button type="button" class="big" class:primary onclick={action} {disabled}>
    <Icon name={icon} size={26} /><span>{label}</span>
  </button>
{/snippet}

{#snippet small(icon: IconName, label: string, action: () => void, disabled = false)}
  <button type="button" class="small" onclick={action} {disabled}
    ><Icon name={icon} size={15} />{label}</button
  >
{/snippet}

{#snippet toggle(label: string, checked: boolean, change: (on: boolean) => void)}
  <label class="switch">
    <input
      type="checkbox"
      role="switch"
      {checked}
      onchange={(e) => change(e.currentTarget.checked)}
    />
    <span aria-hidden="true"></span>{label}
  </label>
{/snippet}

<div class="ribbon">
  <div class="tabs" role="tablist" aria-label="Ribbon">
    {#each TABS as tab (tab)}
      <button
        type="button"
        role="tab"
        id={`ribbon-tab-${tab}`}
        class:file={tab === 'File'}
        aria-selected={active === tab}
        aria-controls="ribbon-panel"
        tabindex={active === tab ? 0 : -1}
        onclick={() => (active = tab)}
        onkeydown={onTabKey}>{tab}</button
      >
    {/each}
  </div>

  <div class="panel" id="ribbon-panel" role="tabpanel" aria-labelledby={`ribbon-tab-${active}`}>
    {#if active === 'File'}
      <div class="group" role="group" aria-label="Document">
        <div class="body">
          {@render big('file', 'New', () => tool.newDocument())}
          {@render big('open', 'Open file', () => sourceInput?.click())}
          <div class="stack">
            {@render small('download', 'Save source', downloadSource)}
            {@render small('trash', 'Delete', deleteDocument)}
          </div>
        </div>
        <div class="caption">Document</div>
      </div>
      <div class="group" role="group" aria-label="Documents">
        <div class="body stack">
          <select
            class="documents"
            aria-label="Open document"
            value={tool.currentId}
            onchange={(e) => tool.switchTo(e.currentTarget.value)}
          >
            {#each tool.documents as document (document.id)}
              <option value={document.id}>{tool.documentName(document)}</option>
            {/each}
          </select>
          <span class="meta"
            >{tool.documents.length === 1 ? '1 document' : `${tool.documents.length} documents`} in this
            workspace</span
          >
        </div>
        <div class="caption">Documents</div>
      </div>
      <div class="group" role="group" aria-label="Examples">
        <div class="body examples">
          {#each EXAMPLES as example (example.name)}
            <button type="button" class="small" onclick={() => tool.newDocument(example.text)}
              >{example.name}</button
            >
          {/each}
        </div>
        <div class="caption">Examples (open as new)</div>
      </div>
      <div class="group" role="group" aria-label="Workspace">
        <div class="body">
          {@render big('open', 'Open workspace', () => workspaceInput?.click())}
          {@render big('download', 'Save workspace', saveWorkspace)}
        </div>
        <div class="caption">Workspace, autosaved in this browser</div>
      </div>
      <div class="group" role="group" aria-label="Share">
        <div class="body">{@render big('link', 'Copy link', copyShareLink, !tool.ready)}</div>
        <div class="caption">Share</div>
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
    {:else if active === 'Home'}
      <div class="group" role="group" aria-label="History">
        <div class="body">
          {@render big('undo', 'Undo', () => tool.undo(), !tool.canUndo)}
          <div class="stack">
            {@render small('redo', 'Redo', () => tool.redo(), !tool.canRedo)}
            {@render small('link', 'Copy link', copyShareLink, !tool.ready)}
          </div>
        </div>
        <div class="caption">History</div>
      </div>
      <div class="group" role="group" aria-label="Layers">
        <div class="body">
          {@render big('plus', 'Add layer', () => tool.addLayer(), !tool.valid)}
          <div class="stack">
            {@render small(
              'trash',
              'Remove',
              () => tool.removeSelectedLayer(),
              !layerSelected || layerCount <= 1,
            )}
            {@render small(
              'left',
              'Move left',
              () => tool.moveSelectedLayer(-1),
              !layerSelected || index <= 0,
            )}
            {@render small(
              'right',
              'Move right',
              () => tool.moveSelectedLayer(1),
              !layerSelected || index >= layerCount - 1,
            )}
          </div>
        </div>
        <div class="caption">Layers</div>
      </div>
      <div class="group" role="group" aria-label="Style">
        <div class="body">
          <div class="gallery" role="group" aria-label="Preset">
            {#each PRESET_IDS as id (id)}
              <button
                type="button"
                class="thumb"
                aria-pressed={tool.preset === id}
                title={PRESET_NAMES[id]}
                onclick={() => tool.setPreset(id)}
              >
                <PresetThumb {id} />
                <span>{PRESET_NAMES[id]}</span>
              </button>
            {/each}
          </div>
          <div class="stack">
            {@render toggle('Transparent background', tool.transparent, (on) =>
              tool.setTransparent(on),
            )}
          </div>
        </div>
        <div class="caption">Style</div>
      </div>
      <div class="group" role="group" aria-label="Labels">
        <div class="body stack">
          {@render toggle('Layer names', tool.labels.names, (on) => tool.setLabel('names', on))}
          {@render toggle('Neuron counts', tool.labels.sizes, (on) => tool.setLabel('sizes', on))}
        </div>
        <div class="caption">Labels</div>
      </div>
      <div class="group" role="group" aria-label="Large layers">
        <div class="body stack numbers">
          <label
            >Collapse above <input
              type="number"
              min="1"
              value={tool.collapse.above}
              disabled={tool.preset === 'boxes'}
              onchange={(e) => setNumber('above', e)}
            /></label
          >
          <label
            >Show first <input
              type="number"
              min="0"
              max="100"
              value={tool.collapse.first}
              disabled={tool.preset === 'boxes'}
              onchange={(e) => setNumber('first', e)}
            /></label
          >
          <label
            >Show last <input
              type="number"
              min="0"
              max="100"
              value={tool.collapse.last}
              disabled={tool.preset === 'boxes'}
              onchange={(e) => setNumber('last', e)}
            /></label
          >
        </div>
        <div class="caption">Large layers</div>
      </div>
      <div class="group" role="group" aria-label="Export">
        <div class="body">
          {@render big('download', 'Export SVG', exportSvg, !tool.layout, true)}
          <div class="stack">
            {@render small('copy', 'Copy SVG', copySvg, !tool.layout)}
            {@render toggle('Editable text', tool.liveText, (on) => (tool.liveText = on))}
          </div>
        </div>
        <div class="caption">Export</div>
      </div>
    {:else if active === 'View'}
      <div class="group" role="group" aria-label="Zoom">
        <div class="body">
          {@render big('fit', 'Fit', () => (tool.zoom = 'fit'))}
          <div class="stack">
            {@render small('plus', 'Zoom in', () => tool.zoomBy(1.25))}
            {@render small('minus', 'Zoom out', () => tool.zoomBy(0.8))}
            <button type="button" class="small" onclick={() => (tool.zoom = 1)}>Actual size</button>
          </div>
        </div>
        <div class="caption">Zoom</div>
      </div>
      <div class="group" role="group" aria-label="Panes">
        <div class="body stack">
          {@render toggle(
            'Layers and source',
            tool.showNavigator,
            (on) => (tool.showNavigator = on),
          )}
          {@render toggle('Format pane', tool.showFormat, (on) => (tool.showFormat = on))}
        </div>
        <div class="caption">Panes</div>
      </div>
      <div class="group" role="group" aria-label="Theme">
        <div class="body">
          {@render big(
            theme === 'dark' ? 'sun' : 'moon',
            theme === 'dark' ? 'Light theme' : 'Dark theme',
            toggleTheme,
          )}
        </div>
        <div class="caption">Theme</div>
      </div>
    {:else}
      <div class="group" role="group" aria-label="Shorthand">
        <div class="body ref">
          <p><code>784-16-16-10</code> layer sizes</p>
          <p><code>16:relu</code> with an activation</p>
          <p><code>dense(64)</code> same as <code>64</code></p>
        </div>
        <div class="caption">Shorthand</div>
      </div>
      <div class="group" role="group" aria-label="YAML">
        <div class="body ref">
          <p><code>- &#123; units: 784, name: Pixels &#125;</code></p>
          <p><code>collapse: &#123; first: 2, last: 4 &#125;</code></p>
          <p><code>style: &#123; labels: &#123; sizes: false &#125; &#125;</code></p>
        </div>
        <div class="caption">YAML</div>
      </div>
      <div class="group" role="group" aria-label="Keyboard">
        <div class="body ref">
          <p><kbd>Ctrl</kbd> <kbd>Z</kbd> undo</p>
          <p><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> redo</p>
        </div>
        <div class="caption">Keyboard</div>
      </div>
      <div class="group" role="group" aria-label="Feedback">
        <div class="body">
          <a class="big" href={`${SITE.repoUrl}/issues`} target="_blank" rel="noopener"
            ><Icon name="external" size={26} /><span>Report an issue</span></a
          >
        </div>
        <div class="caption">Feedback</div>
      </div>
      <div class="group" role="group" aria-label="Privacy">
        <div class="body stack">
          <a class="small" href={`${import.meta.env.BASE_URL}privacy/`}>Privacy and cookies</a>
          <button
            type="button"
            class="small"
            onclick={() => document.dispatchEvent(new CustomEvent('xm:consent-open'))}
            >Cookie settings</button
          >
        </div>
        <div class="caption">Privacy</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .ribbon {
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }

  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 10px;
    border-bottom: 1px solid var(--line);
  }

  .tabs button {
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--ink);
    font: 500 0.85rem var(--font-sans);
    padding: 8px 14px 6px;
    cursor: pointer;
  }

  .tabs button[aria-selected='true'] {
    border-bottom-color: var(--accent);
    font-weight: 700;
  }

  .tabs button.file {
    color: var(--accent);
    font-weight: 700;
  }

  .panel {
    display: flex;
    align-items: stretch;
    height: 100px;
    padding: 6px 6px 0;
    overflow-x: auto;
  }

  .group {
    display: flex;
    flex-direction: column;
    padding: 0 10px;
    border-right: 1px solid var(--line);
    flex: none;
  }

  .body {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .caption {
    padding: 2px 0 4px;
    font-size: 0.7rem;
    color: var(--muted);
    text-align: center;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .big {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 70px;
    padding: 5px 4px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    color: var(--ink);
    font: 500 0.74rem var(--font-sans);
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  .big.primary {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  a.small {
    text-decoration: none;
  }

  .small {
    display: flex;
    align-items: center;
    min-height: 24px;
    gap: 6px;
    padding: 3px 7px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--ink);
    font: 0.8rem var(--font-sans);
    white-space: nowrap;
    cursor: pointer;
  }

  .big:hover:not(:disabled),
  .small:hover:not(:disabled) {
    background: var(--surface-2);
  }

  button:disabled {
    color: var(--muted);
    opacity: 0.55;
    cursor: default;
  }

  .documents {
    min-height: 26px;
    max-width: 210px;
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.8rem var(--font-sans);
  }

  .meta {
    padding: 4px 2px;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .examples {
    display: grid;
    grid-template-columns: auto auto;
    gap: 2px 4px;
  }

  .gallery {
    display: flex;
    gap: 4px;
  }

  .thumb {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    width: 62px;
    height: 58px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.62rem var(--font-sans);
    white-space: nowrap;
    cursor: pointer;
  }

  .thumb:hover {
    border-color: var(--muted);
  }

  .thumb[aria-pressed='true'] {
    border-color: var(--accent);
    outline: 1px solid var(--accent);
  }

  .switch {
    display: flex;
    align-items: center;
    min-height: 24px;
    gap: 8px;
    padding: 3px 4px;
    font-size: 0.8rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .switch {
    position: relative;
  }

  /* The real checkbox covers the whole label, so every click reaches it. */
  .switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .switch span {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 8px;
    background: var(--line);
    flex: none;
  }

  .switch span::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
  }

  .switch input:checked + span {
    background: var(--accent);
  }

  .switch input:checked + span::after {
    left: 14px;
  }

  .switch input:focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .numbers label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.8rem;
  }

  .numbers input {
    width: 72px;
    min-height: 24px;
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--bg);
    color: var(--ink);
    font: 0.8rem var(--font-mono);
  }

  .ref {
    flex-direction: column;
    gap: 3px;
    font-size: 0.78rem;
  }

  .ref p {
    margin: 0;
    white-space: nowrap;
  }

  kbd {
    font: 0.72rem var(--font-mono);
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 3px;
    padding: 0 4px;
  }
</style>
