<script lang="ts">
  // Cloud save on the profile page: connect Google Drive or Dropbox, see when it last saved, save
  // now or disconnect. `compact` is the first-visit version: just the two connect buttons.
  import type { Snippet } from 'svelte';
  import { ago, PROVIDERS, type Provider } from './local.ts';
  import {
    AVAILABLE,
    connectDropbox,
    connectGoogle,
    disconnect,
    loadGoogle,
    sync,
  } from './cloud.ts';
  import { visitor } from './visitor.svelte.ts';

  let {
    compact = false,
    onresult,
    extra,
  }: {
    compact?: boolean;
    onresult: (message: string, error?: boolean) => void;
    /** More buttons for the compact row (the first-visit panel adds "Open a save file"). */
    extra?: Snippet;
  } = $props();

  let busy = $state<Provider | null>(null);
  const order = (['google', 'dropbox'] as const).filter((p) => AVAILABLE[p]);
  const HOME: Record<Provider, string> = {
    google: 'A hidden app folder in your Drive; Xematics sees only its own file',
    dropbox: 'Its own folder, Apps/Xematics',
  };

  async function run(provider: Provider, task: () => Promise<{ imported: string } | void>) {
    busy = provider;
    try {
      const result = await task();
      const label = PROVIDERS[visitor.cloud?.provider ?? provider];
      onresult(
        result?.imported ? `Brought in ${result.imported} from ${label}.` : `Saved to ${label}.`,
      );
    } catch (error) {
      onresult(error instanceof Error ? error.message : 'That did not work. Try again.', true);
    } finally {
      busy = null;
      visitor.read();
    }
  }

  function connect(provider: Provider): void {
    if (provider === 'google') {
      void run('google', connectGoogle);
      return;
    }
    busy = 'dropbox';
    onresult('Opening Dropbox…');
    connectDropbox().catch((error: unknown) => {
      busy = null;
      onresult(error instanceof Error ? error.message : 'Dropbox could not be opened.', true);
    });
  }

  async function unlink() {
    const label = visitor.cloud ? PROVIDERS[visitor.cloud.provider] : '';
    await disconnect();
    visitor.read();
    onresult(`Disconnected from ${label}. Your save there stays until you delete it.`);
  }

  // Google's sign-in window must open straight from a click, so its script loads on approach.
  const warm = () => {
    if (AVAILABLE.google) loadGoogle().catch(() => {});
  };

  const status = $derived.by(() => {
    void visitor.now;
    const s = visitor.cloud;
    if (!s) return '';
    const where = PROVIDERS[s.provider];
    if (visitor.sync === 'saving' || busy) return `Saving to ${where}…`;
    if (visitor.dot === 'auth') return `${where} needs you to sign in again.`;
    if (visitor.dot === 'pending') return 'Changes waiting to be saved.';
    return s.savedAt
      ? `Saved to ${where} · ${ago(s.savedAt, visitor.now)}`
      : `Connected to ${where}.`;
  });
</script>

{#snippet logo(provider: Provider)}
  {#if provider === 'google'}
    <svg class="logo" viewBox="0 0 87.3 78" aria-hidden="true"
      ><path
        fill="#0066da"
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z"
      ></path><path
        fill="#00ac47"
        d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9 9 0 0 0 0 53h27.5z"
      ></path><path
        fill="#ea4335"
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z"
      ></path><path
        fill="#00832d"
        d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
      ></path><path
        fill="#2684fc"
        d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
      ></path><path
        fill="#ffba00"
        d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"
      ></path></svg
    >
  {:else}
    <svg class="logo" viewBox="0 0 43 40" aria-hidden="true"
      ><path
        fill="#0061fe"
        d="M12.5 0 0 8.1l8.7 6.9 12.6-7.8zM0 21.9l12.5 8.2 8.8-7.4-12.6-7.7zm21.3.8 8.8 7.4 12.4-8.2-8.6-6.9zm21.2-14.6L30.1 0l-8.8 7.2 12.6 7.8zM21.4 24.3l-8.9 7.3-3.8-2.4v2.7l12.7 7.6 12.6-7.6v-2.7l-3.8 2.4z"
      ></path></svg
    >
  {/if}
{/snippet}

{#if compact}
  <div class="buttons compact">
    {#each order as p (p)}
      <button
        type="button"
        class="btn"
        disabled={busy !== null}
        onpointerenter={warm}
        onfocus={warm}
        onclick={() => connect(p)}
        >{@render logo(p)}{busy === p ? 'Connecting…' : PROVIDERS[p]}</button
      >
    {/each}
    {@render extra?.()}
  </div>
{:else if order.length === 0}
  <p class="muted">
    Cloud save is not available in this copy of Xematics. The save file works everywhere.
  </p>
{:else}
  <div class="providers">
    {#each order as p (p)}
      {@const on = visitor.cloud?.provider === p}
      <div class="provider" class:on>
        {@render logo(p)}
        <div class="about">
          <b>{PROVIDERS[p]}</b>
          {#if on}
            <small
              >Connected{visitor.cloud?.account?.email
                ? ` as ${visitor.cloud.account.email}`
                : ''}</small
            >
          {:else}
            <small>Not connected</small>
          {/if}
          <small>{HOME[p]}</small>
        </div>
        {#if !on}
          <button
            type="button"
            class="btn connect"
            disabled={busy !== null}
            onpointerenter={warm}
            onfocus={warm}
            onclick={() => connect(p)}>{busy === p ? 'Connecting…' : 'Connect'}</button
          >
        {/if}
      </div>
    {/each}
  </div>
  {#if visitor.cloud}
    {@const cloud = visitor.cloud}
    <p class="status" data-dot={visitor.dot}>
      <i></i><span>{status}</span>
    </p>
    <div class="buttons">
      <button
        type="button"
        class="btn"
        disabled={busy !== null || visitor.sync === 'saving'}
        onpointerenter={warm}
        onclick={() => run(cloud.provider, () => sync({ interactive: true }))}
        >{visitor.dot === 'auth' ? 'Sign in again' : 'Save now'}</button
      >
      <button type="button" class="btn quiet" disabled={busy !== null} onclick={unlink}
        >Disconnect</button
      >
    </div>
    <p class="muted small">
      Saves a few seconds after each change. Open the same save on another device by connecting
      there with the same account.
    </p>
  {:else}
    <p class="muted small">
      Keep your save in your own cloud: it updates by itself, and connecting on another device
      brings everything there.
    </p>
  {/if}
{/if}

<style>
  .providers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }

  .provider {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--line);
    background: var(--surface);
  }

  .provider.on {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .logo {
    width: 30px;
    height: 30px;
    flex: none;
  }

  .buttons .logo {
    width: 16px;
    height: 16px;
  }

  .about {
    display: grid;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .about small {
    color: var(--muted);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }

  .connect {
    align-self: center;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0 0;
    padding: 10px 12px;
    background: var(--surface-2);
    font-size: 0.9rem;
  }

  .status i {
    width: 9px;
    height: 9px;
    flex: none;
    border-radius: 50%;
    background: #2e7d32;
  }

  .status[data-dot='pending'] i {
    background: #c98a00;
  }

  .status[data-dot='auth'] i {
    background: #b3261e;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .buttons.compact {
    justify-content: center;
    margin-top: 0;
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

  .muted {
    color: var(--muted);
  }

  .small {
    font-size: 0.85rem;
  }
</style>
