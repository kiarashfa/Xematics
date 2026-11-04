<script lang="ts">
  // /user/: the visitor's profile. With nothing in this browser yet it welcomes them: start a
  // profile, or bring a save (the "login"). Otherwise: a card with picture, name and numbers, a
  // gallery of their diagrams, cloud save, the save file, and signing out of this browser.
  import { PROFILE_NAME_MAX, parseWorkspace, type Workspace } from '@xematics/core';
  import { onMount } from 'svelte';
  import { documentName } from '../tool/documents.ts';
  import Avatar from './Avatar.svelte';
  import type PicturePicker from './PicturePicker.svelte';
  import type * as Render from './render.ts';
  import CloudSave from './CloudSave.svelte';
  import { finishDropbox, isDropboxReturn, startAutoSave, sync } from './cloud.ts';
  import { loadRaw } from './idb.ts';
  import { ago, cloudState, onLocalChange, PROVIDERS, unsaved } from './local.ts';
  import { browserStore, clearBrowser, describeMerge, updateProfile } from './store.ts';
  import { visitor } from './visitor.svelte.ts';

  const base = import.meta.env.BASE_URL;
  const MAX_FILE_BYTES = 60_000_000;

  let workspace = $state.raw<Workspace | undefined>(undefined);
  let loaded = $state(false);
  let blocked = $state(false);
  let notice = $state('');
  let noticeError = $state(false);
  let picking = $state(false);
  let Picker = $state.raw<typeof PicturePicker | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();
  let signingOut = $state(false);
  let leaving = $state(false);

  // Numbers and previews: the engine loads after the page shows.
  let render = $state.raw<typeof Render | null>(null);

  const profile = $derived(workspace?.profile);
  const documents = $derived(
    [...(workspace?.documents ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
  const neurons = $derived(
    render ? documents.reduce((sum, d) => sum + render!.neurons(d.text), 0) : null,
  );
  const since = $derived(profile?.createdAt ?? documents.at(-1)?.updatedAt);
  const welcome = $derived(loaded && !workspace);

  async function reload() {
    try {
      workspace = await browserStore.load();
      blocked = false;
    } catch {
      blocked = true;
    }
    loaded = true;
  }

  function say(message: string, error = false) {
    notice = message;
    noticeError = error;
  }

  async function openPicker() {
    Picker ??= (await import('./PicturePicker.svelte')).default;
    picking = true;
  }

  // The name, edited in place.
  let editing = $state(false);
  let draft = $state('');
  let nameInput: HTMLInputElement | undefined = $state();
  function editName() {
    draft = profile?.name ?? '';
    editing = true;
    requestAnimationFrame(() => nameInput?.select());
  }
  async function saveName(event?: Event) {
    event?.preventDefault();
    if (!editing) return;
    editing = false;
    if (draft.trim() !== (profile?.name ?? '')) {
      try {
        await updateProfile({ name: draft.trim().slice(0, PROFILE_NAME_MAX) });
      } catch {
        say('This browser blocks site storage, so the name could not be kept.', true);
      }
    }
  }

  async function openFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return say('That save file is too large.', true);
    const parsed = parseWorkspace(await file.text());
    if (!parsed.ok) return say(parsed.error, true);
    try {
      const before = await browserStore.load();
      const brought = describeMerge(before, await browserStore.save(parsed.workspace));
      say(
        brought
          ? `Opened ${file.name}: ${brought}.`
          : `Everything in ${file.name} was already here.`,
      );
    } catch {
      say('This browser blocks site storage, so the save could not be opened here.', true);
    }
  }

  async function download() {
    const raw = await loadRaw().catch(() => undefined);
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'xematics-save.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function signOut() {
    leaving = true;
    const cloud = cloudState();
    if (cloud && unsaved(cloud)) {
      try {
        await sync({ interactive: true });
      } catch (error) {
        leaving = false;
        const reason = error instanceof Error ? error.message : '';
        return say(
          `Could not save to ${PROVIDERS[cloud.provider]} first, so nothing was removed. ${reason}`,
          true,
        );
      }
    }
    if (cloud) {
      const { disconnect } = await import('./cloud.ts');
      await disconnect();
    }
    await clearBrowser();
    location.replace(`${base}user/`);
  }

  /** Mounts a document preview when the engine is ready. */
  const preview = (text: string, id: string) => (node: HTMLElement) => {
    let current = true;
    void render
      ?.thumbnail(text, `g-${id.slice(0, 8)}-`)
      .then((svg) => {
        if (current) node.replaceChildren(...(svg ? [svg] : []));
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  };

  onMount(() => {
    visitor.start();
    const off = onLocalChange(() => void reload());
    void reload().then(() => {
      if (location.hash === '#sign-out' && workspace) {
        signingOut = true;
        requestAnimationFrame(() =>
          document.getElementById('sign-out')?.scrollIntoView({ block: 'center' }),
        );
      }
    });
    if (isDropboxReturn()) {
      say('Connecting Dropbox…');
      finishDropbox().then(
        (r) => say(r.imported ? `Brought in ${r.imported} from Dropbox.` : 'Saved to Dropbox.'),
        (error: unknown) =>
          say(error instanceof Error ? error.message : 'Dropbox did not connect.', true),
      );
    }
    if (cloudState()) startAutoSave();
    void import('./render.ts').then((m) => (render = m));
    return off;
  });
</script>

{#snippet editButton(label: string, onclick: () => void)}
  <button type="button" class="pencil" aria-label={label} title={label} {onclick}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path></svg>
  </button>
{/snippet}

<input
  bind:this={fileInput}
  type="file"
  accept=".json,application/json"
  hidden
  onchange={openFile}
/>

{#if notice}
  <p class="notice" class:error={noticeError} role="status">{notice}</p>
{/if}

{#if !loaded}
  <div class="placeholder" aria-hidden="true"></div>
{:else if blocked}
  <p class="notice error">
    This browser blocks site storage, so nothing can be kept here. Allow site data for this site, or
    use another browser.
  </p>
{:else if welcome}
  <!-- One panel: start a profile here, or bring a save (the "login"). -->
  <section class="welcome" aria-labelledby="welcome-title">
    <span class="pic">
      <Avatar profile={null} size={104} />
    </span>
    <h1 id="welcome-title">Your desk</h1>
    <p class="lead">
      No accounts and no passwords. Your diagrams live in this browser. Give them a name and a face,
      or bring your save from another device.
    </p>
    <button type="button" class="btn btn-primary start" onclick={openPicker}
      >Set up your profile</button
    >
    <p class="or"><span>or bring your save</span></p>
    <CloudSave compact onresult={say}>
      {#snippet extra()}
        <button type="button" class="btn" onclick={() => fileInput?.click()}
          >Open a save file…</button
        >
      {/snippet}
    </CloudSave>
    <p class="hint">
      Your save is your key: open it from your cloud or from the file, and it joins anything already
      in this browser.
    </p>
  </section>
{:else}
  <div class="layout">
    <aside>
      <div class="card who">
        <span class="pic">
          <Avatar profile={visitor.profile} size={120} />
          {@render editButton('Change your picture', openPicker)}
        </span>
        {#if editing}
          <form class="name-form" onsubmit={saveName}>
            <label class="sr-only" for="profile-name">Your name</label>
            <input
              id="profile-name"
              bind:this={nameInput}
              bind:value={draft}
              maxlength={PROFILE_NAME_MAX}
              autocomplete="name"
              onblur={() => saveName()}
              onkeydown={(e) => {
                if (e.key === 'Escape') editing = false;
              }}
            />
          </form>
        {:else}
          <h1 class="name">{profile?.name || 'Your desk'}</h1>
          <button type="button" class="link" onclick={editName}
            >{profile?.name ? 'Edit name' : 'Add your name'}</button
          >
        {/if}
        <dl class="numbers">
          <div>
            <dt>diagrams</dt>
            <dd>{documents.length}</dd>
          </div>
          <div>
            <dt>neurons drawn</dt>
            <dd>{neurons === null ? '…' : neurons.toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>since</dt>
            <dd>
              {since
                ? new Date(since).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                : '-'}
            </dd>
          </div>
          <div>
            <dt>last edit</dt>
            <dd>{documents[0] ? ago(documents[0].updatedAt, visitor.now) : '-'}</dd>
          </div>
        </dl>
      </div>
    </aside>

    <article>
      <h2 class="first">Your diagrams</h2>
      <ul class="gallery">
        {#each documents as doc (doc.id)}
          <li>
            <a href={`${base}tool/?doc=${encodeURIComponent(doc.id)}`}>
              <span class="paper thumb" aria-hidden="true" {@attach preview(doc.text, doc.id)}
              ></span>
              <span class="caption">
                <b>{documentName(doc.text)}</b>
                <small>Edited {ago(doc.updatedAt, visitor.now)}</small>
              </span>
            </a>
          </li>
        {/each}
      </ul>
      <p class="more"><a href={`${base}tool/`}>Open the editor</a> to start a new diagram.</p>

      <h2>Cloud save</h2>
      <CloudSave onresult={say} />

      <h2>Save file</h2>
      <p>
        One file with your diagrams, settings, name and picture. Keep it anywhere; opening it on
        another device joins it with what is there (the newer edit of each diagram wins).
      </p>
      <div class="buttons">
        <button type="button" class="btn" onclick={download}>Download save file</button>
        <button type="button" class="btn quiet" onclick={() => fileInput?.click()}
          >Open a save file…</button
        >
      </div>

      <h2 id="sign-out">This browser</h2>
      <p>
        Signing out saves to your cloud first (if one is connected), then removes your diagrams,
        name and picture from this browser. Do this on a shared computer.
      </p>
      {#if signingOut}
        <div class="confirm" role="group" aria-label="Sign out">
          <p>
            Remove {documents.length}
            {documents.length === 1 ? 'diagram' : 'diagrams'}, your name and picture from this
            browser?
            {visitor.cloud
              ? `They stay in your ${PROVIDERS[visitor.cloud.provider]}.`
              : 'Without a cloud save, download the save file first to keep them.'}
          </p>
          <div class="buttons">
            {#if !visitor.cloud}
              <button type="button" class="btn" onclick={download}>Download save file</button>
            {/if}
            <button type="button" class="btn danger" disabled={leaving} onclick={signOut}
              >{leaving ? 'Signing out…' : 'Sign out'}</button
            >
            <button type="button" class="btn quiet" onclick={() => (signingOut = false)}
              >Cancel</button
            >
          </div>
        </div>
      {:else}
        <div class="buttons">
          <button type="button" class="btn danger" onclick={() => (signingOut = true)}
            >Sign out of this browser</button
          >
        </div>
      {/if}
    </article>
  </div>
{/if}

{#if picking && Picker}
  <Picker profile={visitor.profile} onclose={() => (picking = false)} />
{/if}

<style>
  .placeholder {
    min-height: 60vh;
  }

  .notice {
    margin: 0 0 18px;
    padding: 10px 14px;
    border-left: 3px solid var(--accent);
    background: var(--surface-2);
  }

  .notice.error {
    border-left-color: var(--danger);
  }

  /* The first-visit panel: one column in the middle of the page. */
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(620px, 100%);
    margin: 10px auto 0;
    padding: 36px 32px 30px;
    text-align: center;
    background: var(--surface);
    border-top: 1px solid var(--ink);
    border-bottom: 3px double var(--ink);
  }

  .welcome h1 {
    margin: 14px 0 6px;
    font-size: 2.2rem;
    letter-spacing: -0.01em;
  }

  .welcome .lead {
    margin: 0;
  }

  .welcome .start {
    margin-top: 22px;
    cursor: pointer;
  }

  .or {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    margin: 26px 0 16px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .or::before,
  .or::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--line);
  }

  .hint {
    margin: 16px 0 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  @media (max-width: 520px) {
    .welcome {
      padding: 26px 16px 22px;
    }
  }

  .layout {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 40px;
    align-items: start;
  }

  aside {
    position: sticky;
    top: 20px;
  }

  .card {
    padding: 20px;
    border: 1px solid var(--line);
    background: var(--surface);
  }

  .who {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .pic {
    position: relative;
    display: inline-grid;
    margin-bottom: 12px;
  }

  .pencil {
    position: absolute;
    right: 2px;
    bottom: 2px;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--ink);
    color: var(--bg);
    cursor: pointer;
  }

  .pencil svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .name {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .name-form input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--accent);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 1.2rem;
    font-weight: 600;
    text-align: center;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .numbers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    width: 100%;
    margin: 18px 0 0;
    text-align: left;
  }

  .numbers div {
    display: flex;
    flex-direction: column-reverse;
    padding-top: 6px;
    border-top: 1px solid var(--line);
  }

  .numbers dd {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .numbers dt {
    color: var(--muted);
    font-size: 0.8rem;
  }

  article h2 {
    margin: 34px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
    font-size: 1.2rem;
  }

  article h2.first {
    margin-top: 0;
  }

  article p {
    margin: 0 0 10px;
  }

  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 18px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .gallery a {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--ink);
    text-decoration: none;
  }

  .thumb {
    aspect-ratio: 4 / 3;
    padding: 10px;
    overflow: hidden;
  }

  .thumb :global(svg) {
    max-height: 100%;
  }

  .gallery a:hover .thumb,
  .gallery a:focus-visible .thumb {
    box-shadow: 0 0 0 2px var(--accent);
  }

  .caption {
    display: grid;
  }

  .caption b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .caption small {
    color: var(--muted);
  }

  .more {
    margin-top: 14px;
    color: var(--muted);
  }

  .more a {
    color: var(--accent);
    text-decoration: underline;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .btn {
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .quiet {
    background: none;
  }

  .danger {
    border-color: var(--danger);
    color: var(--danger);
    background: none;
  }

  .confirm {
    padding: 14px;
    border: 1px solid var(--danger);
    background: var(--surface);
  }

  .confirm p {
    margin: 0;
  }

  @media (max-width: 860px) {
    .layout {
      grid-template-columns: 1fr;
      gap: 26px;
    }

    aside {
      position: static;
    }
  }
</style>
