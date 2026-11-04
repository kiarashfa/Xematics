<script lang="ts">
  // The visitor's diagrams on the profile page: grid, cards or details, sorted and searched, with
  // favorites on top, a menu on each diagram (rename, duplicate, favorite, delete), Recently
  // deleted, and Export. Previews render when they scroll into view; the view and sort are
  // remembered in this browser. Changes go through library.ts, which loads on first use.
  import {
    favoriteIds,
    RESTORE_DAYS,
    type Workspace,
    type WorkspaceDocument,
  } from '@xematics/core';
  import { documentName } from '../tool/documents.ts';
  import type ExportAllDialog from './ExportAll.svelte';
  import { ago } from './local.ts';
  import type * as Render from './render.ts';

  let {
    workspace,
    render,
    now,
    onnotice,
  }: {
    workspace: Workspace;
    render: typeof Render | null;
    now: number;
    /** Reports what happened; `undo` adds an Undo button to the message. */
    onnotice: (message: string, error?: boolean, undo?: () => void) => void;
  } = $props();

  type View = 'grid' | 'cards' | 'details';
  type Sort = 'recent' | 'oldest' | 'name' | 'size';
  type Filter = 'all' | 'favorites' | 'deleted';
  const KEY = 'xm-gallery';
  const DAY = 86_400_000;
  const VIEWS: { id: View; label: string }[] = [
    { id: 'grid', label: 'Grid' },
    { id: 'cards', label: 'Cards' },
    { id: 'details', label: 'Details' },
  ];

  const base = import.meta.env.BASE_URL;
  const library = () => import('./library.ts');
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}') as { view?: View; sort?: Sort };
    } catch {
      return {};
    }
  })();
  let view = $state<View>(VIEWS.some((v) => v.id === saved.view) ? saved.view! : 'cards');
  let sort = $state<Sort>(
    ['recent', 'oldest', 'name', 'size'].includes(saved.sort ?? '') ? saved.sort! : 'recent',
  );
  let filter = $state<Filter>('all');
  let query = $state('');
  let menu = $state<string | null>(null);
  let renaming = $state<{ id: string; value: string } | null>(null);
  let renameDialog: HTMLDialogElement | undefined = $state();
  let Exporter = $state.raw<typeof ExportAllDialog | null>(null);
  let exporting = $state(false);

  $effect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ view, sort }));
    } catch {
      // Storage can be blocked; the choice then lasts for this page view.
    }
  });

  const favorites = $derived(favoriteIds(workspace));
  const deleted = $derived(
    (workspace.removed ?? [])
      .filter((r) => r.text !== undefined)
      .map((r) => ({
        id: r.id,
        at: r.at,
        text: r.text!,
        name: documentName(r.text!),
        daysLeft: Math.max(1, RESTORE_DAYS - Math.floor((now - Date.parse(r.at)) / DAY)),
      }))
      .sort((a, b) => b.at.localeCompare(a.at)),
  );

  const items = $derived(
    workspace.documents.map((doc) => ({
      doc,
      name: documentName(doc.text),
      favorite: favorites.has(doc.id),
      facts: render?.facts(doc.text) ?? null,
    })),
  );

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let list = filter === 'favorites' ? items.filter((i) => i.favorite) : [...items];
    if (q)
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || i.doc.text.toLowerCase().includes(q),
      );
    const byDate = (a: (typeof list)[number], b: (typeof list)[number]) =>
      b.doc.updatedAt.localeCompare(a.doc.updatedAt);
    const order = (a: (typeof list)[number], b: (typeof list)[number]) => {
      if (sort === 'recent') return byDate(a, b);
      if (sort === 'oldest') return byDate(b, a);
      if (sort === 'name') return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
      return (b.facts?.neurons ?? 0) - (a.facts?.neurons ?? 0) || byDate(a, b);
    };
    // Favorites stay on top in every order.
    return list.sort((a, b) => Number(b.favorite) - Number(a.favorite) || order(a, b));
  });

  const shownDeleted = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q
      ? deleted.filter((d) => d.name.toLowerCase().includes(q) || d.text.toLowerCase().includes(q))
      : deleted;
  });

  const href = (doc: WorkspaceDocument) => `${base}tool/?doc=${encodeURIComponent(doc.id)}`;
  const count = (n: number, one: string) =>
    `${n.toLocaleString('en-US')} ${n === 1 ? one : `${one}s`}`;

  /** Runs a change and reports a failure; changes show up through the store's change event. */
  async function act(task: () => Promise<unknown>): Promise<boolean> {
    menu = null;
    try {
      await task();
      return true;
    } catch (error) {
      onnotice(error instanceof Error ? error.message : 'That did not work.', true);
      return false;
    }
  }

  function startRename(id: string, name: string) {
    menu = null;
    renaming = { id, value: name };
    requestAnimationFrame(() => {
      renameDialog?.showModal();
      renameDialog?.querySelector('input')?.select();
    });
  }

  async function finishRename(event: Event) {
    event.preventDefault();
    const job = renaming;
    renameDialog?.close();
    if (!job) return;
    await act(async () => (await library()).renameDocument(job.id, job.value));
  }

  async function duplicate(id: string, name: string) {
    if (await act(async () => (await library()).duplicateDocument(id, name)))
      onnotice(`Made a copy of ${name}.`);
  }

  async function toggleFavorite(id: string, on: boolean) {
    await act(async () => (await library()).setFavorite(id, on));
  }

  async function remove(id: string, name: string) {
    if (await act(async () => (await library()).deleteDocument(id)))
      onnotice(`Moved ${name} to Recently deleted.`, false, () => void restore(id, name));
  }

  async function restore(id: string, name: string) {
    if (await act(async () => (await library()).restoreDocument(id))) onnotice(`Restored ${name}.`);
  }

  async function forget(id: string, name: string) {
    if (await act(async () => (await library()).forgetDocument(id)))
      onnotice(`Deleted ${name} for good.`);
  }

  async function openExport() {
    Exporter ??= (await import('./ExportAll.svelte')).default;
    exporting = true;
  }

  // The menu closes on a click elsewhere and on Escape.
  function onWindowClick(event: MouseEvent) {
    if (menu && !(event.target instanceof Element && event.target.closest('.item-menu, .more')))
      menu = null;
  }
  function onWindowKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && menu) {
      document.querySelector<HTMLElement>(`[data-more="${menu}"]`)?.focus();
      menu = null;
    }
  }

  /** Mounts a preview once it scrolls near the screen and the engine is ready. */
  const thumb =
    (id: string, stamp: string, text: string, r: typeof Render | null) => (node: HTMLElement) => {
      if (!r) return;
      let live = true;
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          observer.disconnect();
          void r
            .preview(id, stamp, text)
            .then((svg) => {
              if (live) node.replaceChildren(...(svg ? [svg] : []));
            })
            .catch(() => {});
        },
        { rootMargin: '300px' },
      );
      observer.observe(node);
      return () => {
        live = false;
        observer.disconnect();
      };
    };
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

{#snippet viewIcon(id: View)}
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {#if id === 'grid'}
      <rect x="4" y="4" width="6.5" height="6.5"></rect><rect
        x="13.5"
        y="4"
        width="6.5"
        height="6.5"
      ></rect><rect x="4" y="13.5" width="6.5" height="6.5"></rect><rect
        x="13.5"
        y="13.5"
        width="6.5"
        height="6.5"
      ></rect>
    {:else if id === 'cards'}
      <rect x="3.5" y="4" width="7.5" height="11"></rect><rect x="13" y="4" width="7.5" height="11"
      ></rect><path d="M3.5 18.5h7.5M13 18.5h7.5"></path>
    {:else}
      <rect x="3.5" y="5" width="4" height="3"></rect><rect x="3.5" y="10.5" width="4" height="3"
      ></rect><rect x="3.5" y="16" width="4" height="3"></rect><path
        d="M10 6.5h10.5M10 12h10.5M10 17.5h10.5"
      ></path>
    {/if}
  </svg>
{/snippet}

{#snippet star(on: boolean)}
  <svg class="star" class:on viewBox="0 0 24 24" aria-hidden="true"
    ><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"
    ></path></svg
  >
{/snippet}

<!-- The "..." button and its menu for one diagram. -->
{#snippet actions(doc: WorkspaceDocument, name: string, favorite: boolean)}
  <button
    type="button"
    class="more"
    aria-label={`More for ${name}`}
    aria-haspopup="menu"
    aria-expanded={menu === doc.id}
    data-more={doc.id}
    onclick={() => (menu = menu === doc.id ? null : doc.id)}
    ><svg viewBox="0 0 24 24" aria-hidden="true"
      ><circle cx="5.5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle
        cx="18.5"
        cy="12"
        r="1.6"
      ></circle></svg
    ></button
  >
  {#if menu === doc.id}
    <div class="item-menu" role="menu" aria-label={name}>
      <a role="menuitem" href={href(doc)}>Open in the editor</a>
      <button type="button" role="menuitem" onclick={() => startRename(doc.id, name)}
        >Rename…</button
      >
      <button type="button" role="menuitem" onclick={() => duplicate(doc.id, name)}
        >Duplicate</button
      >
      <button type="button" role="menuitem" onclick={() => toggleFavorite(doc.id, !favorite)}
        >{favorite ? 'Remove from favorites' : 'Add to favorites'}</button
      >
      <button type="button" role="menuitem" class="danger" onclick={() => remove(doc.id, name)}
        >Delete</button
      >
    </div>
  {/if}
{/snippet}

<section class="gallery" aria-labelledby="gallery-title">
  <header class="bar">
    <h2 id="gallery-title">Your diagrams <span>{workspace.documents.length}</span></h2>
    <div class="tools">
      <label class="search">
        <span class="sr-only">Find a diagram</span>
        <input type="search" placeholder="Find a diagram" bind:value={query} />
      </label>
      {#if filter !== 'deleted'}
        <label class="sort">
          <span class="sr-only">Sort by</span>
          <select bind:value={sort}>
            <option value="recent">Recently edited</option>
            <option value="oldest">Oldest edit first</option>
            <option value="name">Name</option>
            <option value="size">Most neurons</option>
          </select>
        </label>
        <div class="views" role="group" aria-label="View">
          {#each VIEWS as v (v.id)}
            <button
              type="button"
              aria-pressed={view === v.id}
              aria-label={v.label}
              title={v.label}
              onclick={() => (view = v.id)}>{@render viewIcon(v.id)}</button
            >
          {/each}
        </div>
      {/if}
      <button type="button" class="btn" disabled={shown.length === 0} onclick={openExport}
        >Export</button
      >
      <a class="btn btn-primary new" href={`${base}tool/?new`}
        >New<span class="long"> diagram</span></a
      >
    </div>
  </header>

  <div class="filters" role="group" aria-label="Show">
    <button type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}
      >All <span>{workspace.documents.length}</span></button
    >
    <button
      type="button"
      aria-pressed={filter === 'favorites'}
      onclick={() => (filter = 'favorites')}
      >Favorites <span>{items.filter((i) => i.favorite).length}</span></button
    >
    <button type="button" aria-pressed={filter === 'deleted'} onclick={() => (filter = 'deleted')}
      >Recently deleted <span>{deleted.length}</span></button
    >
  </div>

  {#if filter === 'deleted'}
    {#if shownDeleted.length === 0}
      <p class="empty">
        {query.trim()
          ? `No deleted diagram matches “${query.trim()}”.`
          : `Nothing here. Deleted diagrams wait here for ${RESTORE_DAYS} days, so you can bring them back.`}
      </p>
    {:else}
      <ul class="deleted">
        {#each shownDeleted as d (d.id)}
          <li>
            <span class="paper thumb" aria-hidden="true" {@attach thumb(d.id, d.at, d.text, render)}
            ></span>
            <span class="caption">
              <b>{d.name}</b>
              <small
                >Deleted {ago(d.at, now)} · {d.daysLeft}
                {d.daysLeft === 1 ? 'day' : 'days'} left</small
              >
            </span>
            <span class="row-actions">
              <button type="button" class="btn" onclick={() => restore(d.id, d.name)}
                >Restore</button
              >
              <button type="button" class="btn quiet danger" onclick={() => forget(d.id, d.name)}
                >Delete forever</button
              >
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if shown.length === 0}
    <p class="empty">
      {query.trim()
        ? `No diagram matches “${query.trim()}”.`
        : 'No favorites yet. Use the … menu on a diagram to add one.'}
    </p>
  {:else if view === 'details'}
    <table class="details">
      <thead>
        <tr>
          <th scope="col"><span class="sr-only">Preview</span></th>
          <th scope="col">Name</th>
          <th scope="col" class="num layers">Layers</th>
          <th scope="col" class="num">Neurons</th>
          <th scope="col" class="wide">Style</th>
          <th scope="col">Edited</th>
          <th scope="col"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {#each shown as { doc, name, facts, favorite } (doc.id)}
          <tr>
            <td class="mini"
              ><a href={href(doc)} tabindex="-1" aria-hidden="true"
                ><span class="paper thumb" {@attach thumb(doc.id, doc.updatedAt, doc.text, render)}
                ></span></a
              ></td
            >
            <td class="name"
              ><a href={href(doc)}>{name}</a>{#if favorite}<span class="sr-only">, favorite</span
                >{@render star(true)}{/if}</td
            >
            <td class="num layers">{facts ? facts.layers : '…'}</td>
            <td class="num">{facts ? facts.neurons.toLocaleString('en-US') : '…'}</td>
            <td class="wide">{facts?.style ?? '…'}</td>
            <td class="when">{ago(doc.updatedAt, now)}</td>
            <td class="act">{@render actions(doc, name, favorite)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <ul class={view}>
      {#each shown as { doc, name, facts, favorite } (doc.id)}
        <li>
          <a href={href(doc)}>
            <span
              class="paper thumb"
              aria-hidden="true"
              {@attach thumb(doc.id, doc.updatedAt, doc.text, render)}
            ></span>
            <span class="caption">
              <b
                >{#if favorite}{@render star(true)}<span class="sr-only"
                    >Favorite:
                  </span>{/if}{name}</b
              >
              {#if view === 'cards'}
                <small>Edited {ago(doc.updatedAt, now)}</small>
                {#if facts}
                  <small
                    >{count(facts.layers, 'layer')} · {count(facts.neurons, 'neuron')} · {facts.style}</small
                  >
                {/if}
              {/if}
            </span>
          </a>
          {@render actions(doc, name, favorite)}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<dialog
  class="rename"
  bind:this={renameDialog}
  onclose={() => (renaming = null)}
  aria-labelledby="rename-title"
>
  {#if renaming}
    <form onsubmit={finishRename}>
      <h2 id="rename-title">Rename diagram</h2>
      <label for="rename-input" class="sr-only">Title</label>
      <input id="rename-input" bind:value={renaming.value} maxlength="120" autocomplete="off" />
      <p>The title is part of the diagram's source, so the editor shows it too.</p>
      <div class="rename-buttons">
        <button type="button" class="btn" onclick={() => renameDialog?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary">Rename</button>
      </div>
    </form>
  {/if}
</dialog>

{#if exporting && Exporter}
  <Exporter
    diagrams={shown.map((i) => ({ name: i.name, text: i.doc.text }))}
    settings={workspace.settings}
    onclose={() => (exporting = false)}
    onresult={onnotice}
  />
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 18px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    margin: 0;
    font-size: 1.3rem;
  }

  h2 span {
    margin-left: 4px;
    color: var(--muted);
    font-weight: 400;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  input,
  select {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 2px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
  }

  .search input {
    width: 180px;
  }

  .views {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 2px;
  }

  .views button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 34px;
    border: 0;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }

  .views button + button {
    border-left: 1px solid var(--line);
  }

  .views button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--bg);
  }

  .views svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .btn {
    height: 36px;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    margin: 0 0 18px;
    border-bottom: 1px solid var(--line);
  }

  .filters button {
    margin-bottom: -1px;
    padding: 10px 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .filters button span {
    margin-left: 2px;
    font-size: 0.8rem;
  }

  .filters button[aria-pressed='true'] {
    color: var(--ink);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }

  .empty {
    color: var(--muted);
  }

  ul {
    display: grid;
    gap: 18px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  ul.grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 14px;
  }

  ul.cards {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 22px;
  }

  ul.grid > li,
  ul.cards > li {
    position: relative;
  }

  li > a {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--ink);
    text-decoration: none;
  }

  .thumb {
    aspect-ratio: 4 / 3;
    padding: 8px;
    overflow: hidden;
  }

  .thumb :global(svg) {
    max-height: 100%;
  }

  .cards .thumb {
    padding: 14px;
  }

  li > a:hover .thumb,
  li > a:focus-visible .thumb {
    box-shadow: 0 0 0 2px var(--accent);
  }

  li > a:focus-visible {
    outline: none;
  }

  .caption {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .caption b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .grid .caption b {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .caption small {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .star {
    display: inline-block;
    width: 15px;
    height: 15px;
    margin: 0 4px -2px 0;
    fill: #c98a00;
    stroke: #c98a00;
    stroke-width: 1;
    stroke-linejoin: round;
  }

  .name .star {
    margin: 0 0 -2px 6px;
  }

  /* The "..." button sits on the preview's top right corner (in the details table, its row). */
  .more {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }

  .grid .more,
  .cards .more {
    position: absolute;
    top: 6px;
    right: 6px;
    box-shadow: 0 1px 3px color-mix(in srgb, #000 18%, transparent);
  }

  .more svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }

  .more[aria-expanded='true'] {
    border-color: var(--accent);
  }

  .item-menu {
    position: absolute;
    top: 42px;
    right: 6px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 210px;
    padding: 4px 0;
    background: var(--surface);
    border: 1px solid var(--ink);
    box-shadow: 4px 4px 0 color-mix(in srgb, var(--ink) 12%, transparent);
    text-align: left;
  }

  .details .item-menu {
    top: 38px;
    right: 0;
  }

  .item-menu a,
  .item-menu button {
    padding: 9px 14px;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .item-menu a:hover,
  .item-menu button:hover,
  .item-menu a:focus-visible,
  .item-menu button:focus-visible {
    background: var(--surface-2);
    outline-offset: -2px;
  }

  .item-menu .danger {
    margin-top: 4px;
    border-top: 1px solid var(--line);
    color: var(--danger);
  }

  .details {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .details th {
    padding: 6px 10px;
    border-bottom: 1px solid var(--ink);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-align: left;
    text-transform: uppercase;
  }

  .details td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }

  .details .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .details .mini {
    width: 76px;
    padding-left: 0;
  }

  .details .mini .thumb {
    display: grid;
    width: 72px;
    padding: 4px;
  }

  .details .name a {
    color: var(--ink);
    font-weight: 600;
    text-decoration: none;
  }

  .details .name a:hover {
    text-decoration: underline;
  }

  .details .when {
    color: var(--muted);
    white-space: nowrap;
  }

  .details .act {
    position: relative;
    width: 44px;
    padding-right: 0;
  }

  /* Recently deleted: one row per diagram with Restore and Delete forever. */
  ul.deleted {
    gap: 0;
  }

  .deleted li {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }

  .deleted .thumb {
    display: grid;
    padding: 4px;
    opacity: 0.75;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .quiet {
    background: none;
  }

  .danger {
    color: var(--danger);
  }

  .btn.danger {
    border-color: var(--danger);
  }

  .rename {
    margin: auto;
    width: min(420px, calc(100vw - 24px));
    padding: 18px;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--ink);
    box-shadow: 6px 6px 0 color-mix(in srgb, var(--ink) 14%, transparent);
  }

  .rename::backdrop {
    background: color-mix(in srgb, #000 45%, transparent);
  }

  .rename h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }

  .rename input {
    width: 100%;
  }

  .rename p {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .rename-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  @media (max-width: 640px) {
    .tools {
      width: 100%;
    }

    .search {
      flex-basis: 100%;
    }

    .search input {
      width: 100%;
    }

    .sort {
      flex: 1;
    }

    .sort select {
      width: 100%;
    }

    /* "New" on phones; the button is still named "New diagram". */
    .long {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    ul.grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    }

    .details .wide,
    .details .layers {
      display: none;
    }

    .deleted li {
      grid-template-columns: 72px minmax(0, 1fr);
    }

    .row-actions {
      grid-column: 1 / -1;
    }
  }
</style>
