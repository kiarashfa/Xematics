<script lang="ts">
  import { renderDiagram, type WorkspaceDocument } from '@xematics/core';
  import wordmark from '../../../assets/wordmark.svg?raw';
  import { openSourceFile, openWorkspaceFile, saveWorkspace } from '../../actions.ts';
  import { parseSafeSvg } from '../../safe-svg.ts';
  import { EXAMPLES, tool } from '../../state.svelte.ts';
  import Avatar from '../../../user/Avatar.svelte';
  import { PROVIDERS } from '../../../user/local.ts';
  import { visitor } from '../../../user/visitor.svelte.ts';
  import Icon from '../Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { home, onOpen }: { home: string; onOpen: () => void } = $props();
  let tab = $state<'documents' | 'examples'>('documents');
  let menu = $state(false);
  let sourceInput: HTMLInputElement | undefined = $state();
  let workspaceInput: HTMLInputElement | undefined = $state();

  const documents = $derived(
    [...tool.documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
  const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  function edited(document: WorkspaceDocument): string {
    const minutes = Math.round((Date.parse(document.updatedAt) - Date.now()) / 60_000);
    if (minutes > -1) return 'Edited just now';
    if (minutes > -60) return `Edited ${relative.format(minutes, 'minute')}`;
    if (minutes > -1440) return `Edited ${relative.format(Math.round(minutes / 60), 'hour')}`;
    return `Edited ${relative.format(Math.round(minutes / 1440), 'day')}`;
  }

  /** Renders a small preview with its own id prefix and mounts it safely. */
  const thumbnail = (text: string, key: string) => (node: HTMLElement) => {
    let current = true;
    const engine = tool.engine;
    if (engine) {
      // Rendering waits for any fonts or formulas the document needs.
      void renderDiagram(text, engine, { prefix: `th-${key}-` }).then(({ svg }) => {
        const element = current && svg ? parseSafeSvg(svg) : undefined;
        if (current) node.replaceChildren(...(element ? [element] : []));
      });
    }
    return () => {
      current = false;
    };
  };

  function open(id: string) {
    tool.switchTo(id);
    onOpen();
  }

  function create(text?: string) {
    tool.newDocument(text);
    onOpen();
  }

  function remove(document: WorkspaceDocument) {
    if (
      !confirm(
        `Delete "${tool.documentName(document)}"? You can restore it from your profile for 30 days.`,
      )
    )
      return;
    tool.switchTo(document.id);
    tool.deleteCurrent();
  }

  async function onFile(event: Event, action: (file: File) => Promise<void>) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    menu = false;
    if (file) await action(file);
  }
</script>

<div class="files">
  <header class="ph-bar">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- static wordmark generated at build time -->
    <a class="brand" href={home} aria-label="Xematics home">{@html wordmark}</a>
    <h1 class="sr-only">Documents</h1>
    <span class="grow"></span>
    <a class="me" href={`${home}user/`} aria-label="Your profile"
      ><Avatar profile={visitor.profile} size={30} dot={visitor.dot} /></a
    >
    <button type="button" class="ph-ib" aria-label="Workspace options" onclick={() => (menu = true)}
      ><Icon name="more" /></button
    >
  </header>

  <div class="seg" role="tablist" aria-label="Lists">
    <button
      type="button"
      role="tab"
      aria-selected={tab === 'documents'}
      onclick={() => (tab = 'documents')}>Documents</button
    >
    <button
      type="button"
      role="tab"
      aria-selected={tab === 'examples'}
      onclick={() => (tab = 'examples')}>Examples</button
    >
  </div>

  <div class="panel" role="tabpanel">
    <ul class="list">
      {#if tab === 'documents'}
        {#each documents as document (document.id)}
          <li>
            <button type="button" class="doc" onclick={() => open(document.id)}>
              <span class="thumb" aria-hidden="true" {@attach thumbnail(document.text, document.id)}
              ></span>
              <span class="text"
                ><b>{tool.documentName(document)}</b><small>{edited(document)}</small></span
              >
            </button>
            <button
              type="button"
              class="ph-ib"
              aria-label={`Delete ${tool.documentName(document)}`}
              onclick={() => remove(document)}><Icon name="trash" size={18} /></button
            >
          </li>
        {/each}
      {:else}
        {#each EXAMPLES as example, i (example.name)}
          <li>
            <button type="button" class="doc" onclick={() => create(example.text)}>
              <span class="thumb" aria-hidden="true" {@attach thumbnail(example.text, `ex${i}`)}
              ></span>
              <span class="text"><b>{example.name}</b><small>Opens as a new document</small></span>
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  </div>

  <p class="saved">
    <Icon name="check" size={16} />{tool.saveStatus === 'error'
      ? 'Browser storage is blocked'
      : visitor.cloud
        ? `Saved to ${PROVIDERS[visitor.cloud.provider]}`
        : 'Saved in this browser'} ·
    <button type="button" class="link" onclick={saveWorkspace}>Download save file</button>
  </p>

  <button type="button" class="fab" onclick={() => create()}><Icon name="plus" />New diagram</button
  >

  {#if menu}
    <Sheet label="Workspace" onclose={() => (menu = false)}>
      <ul class="ph-rows">
        <li>
          <button type="button" class="ph-row" onclick={() => sourceInput?.click()}
            ><Icon name="open" /><span class="ph-label">Open a diagram file</span></button
          >
        </li>
        <li>
          <button type="button" class="ph-row" onclick={() => workspaceInput?.click()}
            ><Icon name="open" /><span class="ph-label">Open save file</span></button
          >
        </li>
        <li>
          <button
            type="button"
            class="ph-row"
            onclick={() => {
              menu = false;
              saveWorkspace();
            }}><Icon name="download" /><span class="ph-label">Download save file</span></button
          >
        </li>
        <li>
          <button
            type="button"
            class="ph-row"
            onclick={() => {
              menu = false;
              document.dispatchEvent(new CustomEvent('xm:consent-open'));
            }}><Icon name="help" /><span class="ph-label">Cookie settings</span></button
          >
        </li>
        <li>
          <a class="ph-row" href={`${home}guide/`}
            ><Icon name="help" /><span class="ph-label">Syntax and export guide</span></a
          >
        </li>
        <li>
          <a class="ph-row" href={`${home}about/#privacy`}
            ><Icon name="external" /><span class="ph-label">Privacy and cookies</span></a
          >
        </li>
      </ul>
      <p class="hint">
        Your work is saved in this browser. Clearing site data removes it, so save the workspace to
        keep a copy.
      </p>
    </Sheet>
  {/if}
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
</div>

<style>
  .files {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg);
  }

  .brand {
    display: inline-flex;
    padding-left: 8px;
    color: var(--ink);
  }

  .brand :global(svg) {
    height: 24px;
    width: auto;
  }

  .me {
    display: inline-grid;
    margin-right: 4px;
    border-radius: 50%;
  }

  .grow {
    flex: 1;
  }

  .seg {
    display: flex;
    margin: 10px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }

  .seg button {
    flex: 1;
    min-height: 42px;
    border: 0;
    background: var(--surface);
    color: var(--ink);
    font: 600 0.9rem var(--font-sans);
  }

  .seg button + button {
    border-left: 1px solid var(--line);
  }

  .seg button[aria-selected='true'] {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .panel {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .list {
    flex: 1;
    margin: 0;
    padding: 0 8px 96px;
    overflow: auto;
    list-style: none;
  }

  .list li {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--line);
  }

  .doc {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 10px 6px;
    border: 0;
    background: none;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }

  .thumb {
    display: grid;
    place-items: center;
    width: 76px;
    height: 54px;
    flex: none;
    padding: 3px;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 0 0 1px var(--line);
  }

  .thumb :global(svg) {
    max-width: 100%;
    max-height: 48px;
    width: auto;
    height: auto;
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .text b {
    font-size: 0.95rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .text small {
    color: var(--muted);
  }

  .saved {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 86px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
    pointer-events: none;
  }

  .link {
    min-height: 24px;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    pointer-events: auto;
    cursor: pointer;
  }

  .fab {
    position: absolute;
    right: 16px;
    bottom: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 54px;
    padding: 0 20px;
    border: 0;
    border-radius: 18px;
    background: var(--accent);
    color: var(--accent-ink);
    font: 700 0.95rem var(--font-sans);
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.2);
    cursor: pointer;
  }

  .hint {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
