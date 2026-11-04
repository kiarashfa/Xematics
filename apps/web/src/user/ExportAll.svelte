<script lang="ts">
  // "Export all": the diagrams shown in the gallery, in one format, as one ZIP file.
  import type { WorkspaceSettings } from '@xematics/core';
  import { onMount, untrack } from 'svelte';
  import { PNG_SIZES } from '../tool/formats.ts';
  import type { BulkFormat } from './export.ts';

  let {
    diagrams,
    settings,
    onclose,
    onresult,
  }: {
    diagrams: readonly { name: string; text: string }[];
    settings: WorkspaceSettings | undefined;
    onclose: () => void;
    onresult: (message: string, error?: boolean) => void;
  } = $props();

  const FORMATS: { id: BulkFormat; label: string; note: string }[] = [
    { id: 'svg', label: 'SVG', note: 'Vector images' },
    { id: 'png', label: 'PNG', note: 'Images for slides' },
    { id: 'pdf', label: 'PDF', note: 'Vector, for papers' },
    { id: 'tex', label: 'TikZ', note: 'LaTeX code' },
    { id: 'source', label: 'Source', note: 'The text you wrote' },
  ];

  const start = untrack(() => settings);
  let dialog: HTMLDialogElement | undefined = $state();
  let format = $state<BulkFormat>(
    FORMATS.some((f) => f.id === start?.exportFormat) ? (start!.exportFormat as BulkFormat) : 'svg',
  );
  let pngDpi = $state(PNG_SIZES.some((s) => s.dpi === start?.pngDpi) ? start!.pngDpi! : 300);
  let working = $state<{ done: number; total: number } | null>(null);

  async function run() {
    working = { done: 0, total: diagrams.length };
    try {
      const { exportAll } = await import('./export.ts');
      const result = await exportAll(
        diagrams,
        {
          format,
          pngDpi,
          liveText: settings?.liveText ?? false,
          tikzStandalone: settings?.tikzStandalone ?? true,
        },
        (done, total) => (working = { done, total }),
      );
      const left = result.skipped.length
        ? ` Left out (fix them in the editor): ${result.skipped.join(', ')}.`
        : '';
      onresult(
        result.count
          ? `Downloaded ${result.count} ${result.count === 1 ? 'diagram' : 'diagrams'} as a ZIP file.${left}`
          : `Nothing to export.${left}`,
        result.count === 0,
      );
      dialog?.close();
    } catch (error) {
      onresult(error instanceof Error ? error.message : 'The export did not work.', true);
      working = null;
    }
  }

  onMount(() => dialog?.showModal());
</script>

<dialog class="export" bind:this={dialog} {onclose} aria-labelledby="export-title">
  <header>
    <h2 id="export-title">Export {diagrams.length === 1 ? 'diagram' : 'diagrams'}</h2>
    <p>
      The {diagrams.length === 1 ? 'diagram' : `${diagrams.length} diagrams`} shown, as one ZIP file.
    </p>
  </header>
  <fieldset>
    <legend class="sr-only">Format</legend>
    {#each FORMATS as f (f.id)}
      <label class:on={format === f.id}>
        <input type="radio" name="bulk-format" value={f.id} bind:group={format} />
        <b>{f.label}</b>
        <small>{f.note}</small>
      </label>
    {/each}
  </fieldset>
  {#if format === 'png'}
    <label class="dpi">
      Resolution
      <select bind:value={pngDpi}>
        {#each PNG_SIZES as size (size.dpi)}<option value={size.dpi}>{size.label}</option>{/each}
      </select>
    </label>
  {/if}
  <footer>
    {#if working}
      <span class="progress" role="status">Making {working.done} of {working.total}…</span>
    {/if}
    <span class="grow"></span>
    <button type="button" class="btn" onclick={() => dialog?.close()}>Cancel</button>
    <button type="button" class="btn btn-primary" disabled={!!working} onclick={run}
      >Download ZIP</button
    >
  </footer>
</dialog>

<style>
  .export {
    margin: auto;
    width: min(460px, calc(100vw - 24px));
    padding: 0;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--ink);
    box-shadow: 6px 6px 0 color-mix(in srgb, var(--ink) 14%, transparent);
  }

  .export::backdrop {
    background: color-mix(in srgb, #000 45%, transparent);
  }

  header {
    padding: 14px 18px 10px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  header p {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  fieldset {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 14px 18px 4px;
    border: 0;
  }

  fieldset label {
    display: grid;
    grid-template-columns: auto 64px 1fr;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    cursor: pointer;
  }

  fieldset label.on {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  input[type='radio'] {
    accent-color: var(--accent);
  }

  small {
    color: var(--muted);
  }

  .dpi {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px 0;
    font-size: 0.9rem;
  }

  select {
    height: 34px;
    padding: 0 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    padding: 12px 18px;
    border-top: 1px solid var(--line);
  }

  .progress {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .grow {
    flex: 1;
  }

  .btn {
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: default;
  }
</style>
