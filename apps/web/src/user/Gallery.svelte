<script lang="ts">
  // The visitor's diagrams on the profile page: grid, cards or details, sorted and searched.
  // Previews render when they scroll into view; the view and sort are remembered in this browser.
  import type { WorkspaceDocument } from '@xematics/core';
  import { documentName } from '../tool/documents.ts';
  import { ago } from './local.ts';
  import type * as Render from './render.ts';

  let {
    documents,
    render,
    now,
  }: {
    documents: readonly WorkspaceDocument[];
    render: typeof Render | null;
    now: number;
  } = $props();

  type View = 'grid' | 'cards' | 'details';
  type Sort = 'recent' | 'oldest' | 'name' | 'size';
  const KEY = 'xm-gallery';
  const VIEWS: { id: View; label: string }[] = [
    { id: 'grid', label: 'Grid' },
    { id: 'cards', label: 'Cards' },
    { id: 'details', label: 'Details' },
  ];

  const base = import.meta.env.BASE_URL;
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
  let query = $state('');

  $effect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ view, sort }));
    } catch {
      // Storage can be blocked; the choice then lasts for this page view.
    }
  });

  const items = $derived(
    documents.map((doc) => ({
      doc,
      name: documentName(doc.text),
      facts: render?.facts(doc.text) ?? null,
    })),
  );

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter(
          (i) => i.name.toLowerCase().includes(q) || i.doc.text.toLowerCase().includes(q),
        )
      : [...items];
    const byDate = (a: (typeof list)[number], b: (typeof list)[number]) =>
      b.doc.updatedAt.localeCompare(a.doc.updatedAt);
    if (sort === 'recent') list.sort(byDate);
    else if (sort === 'oldest') list.sort((a, b) => byDate(b, a));
    else if (sort === 'name')
      list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    else list.sort((a, b) => (b.facts?.neurons ?? 0) - (a.facts?.neurons ?? 0) || byDate(a, b));
    return list;
  });

  const href = (doc: WorkspaceDocument) => `${base}tool/?doc=${encodeURIComponent(doc.id)}`;
  const count = (n: number, one: string) =>
    `${n.toLocaleString('en-US')} ${n === 1 ? one : `${one}s`}`;

  /** Mounts a document preview once it scrolls near the screen and the engine is ready. */
  const thumb = (doc: WorkspaceDocument, r: typeof Render | null) => (node: HTMLElement) => {
    if (!r) return;
    let live = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void r
          .preview(doc.id, doc.updatedAt, doc.text)
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

<section class="gallery" aria-labelledby="gallery-title">
  <header class="bar">
    <h2 id="gallery-title">Your diagrams <span>{documents.length}</span></h2>
    <div class="tools">
      <label class="search">
        <span class="sr-only">Find a diagram</span>
        <input type="search" placeholder="Find a diagram" bind:value={query} />
      </label>
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
      <a class="btn btn-primary new" href={`${base}tool/?new`}
        >New<span class="long"> diagram</span></a
      >
    </div>
  </header>

  {#if shown.length === 0}
    <p class="empty">No diagram matches “{query.trim()}”.</p>
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
        </tr>
      </thead>
      <tbody>
        {#each shown as { doc, name, facts } (doc.id)}
          <tr>
            <td class="mini"
              ><a href={href(doc)} tabindex="-1" aria-hidden="true"
                ><span class="paper thumb" {@attach thumb(doc, render)}></span></a
              ></td
            >
            <td class="name"><a href={href(doc)}>{name}</a></td>
            <td class="num layers">{facts ? facts.layers : '…'}</td>
            <td class="num">{facts ? facts.neurons.toLocaleString('en-US') : '…'}</td>
            <td class="wide">{facts?.style ?? '…'}</td>
            <td class="when">{ago(doc.updatedAt, now)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <ul class={view}>
      {#each shown as { doc, name, facts } (doc.id)}
        <li>
          <a href={href(doc)}>
            <span class="paper thumb" aria-hidden="true" {@attach thumb(doc, render)}></span>
            <span class="caption">
              <b>{name}</b>
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
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 18px;
    padding-bottom: 12px;
    margin-bottom: 18px;
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
    width: 190px;
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

  .new {
    height: 36px;
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

  li a {
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

  li a:hover .thumb,
  li a:focus-visible .thumb {
    box-shadow: 0 0 0 2px var(--accent);
  }

  li a:focus-visible {
    outline: none;
  }

  .caption {
    display: grid;
    gap: 1px;
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
  }
</style>
