<script lang="ts">
  // The profile circle as Svelte draws it; same markup and styles (global.css) as the header's.
  import type { ProfileMirror } from './local.ts';

  let {
    profile,
    size = 32,
    dot = null,
  }: { profile: ProfileMirror | null; size?: number; dot?: string | null } = $props();

  const kind = $derived(
    profile?.picture ? 'picture' : profile?.emoji ? 'emoji' : profile?.mono ? 'mono' : '',
  );
  const tint = $derived(
    kind === 'picture' ? undefined : (profile?.emoji?.color ?? profile?.mono?.color),
  );
</script>

<span class="wrap">
  <span class="avatar" style:--av={`${size}px`} data-kind={kind} data-tint={tint}>
    <svg class="avatar-icon" viewBox="0 0 24 24" aria-hidden="true"
      ><circle cx="12" cy="9" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path></svg
    >
    {#if kind === 'picture'}
      <img class="avatar-img" src={profile?.picture} alt="" width={size} height={size} />
    {:else if kind}
      <span class="avatar-glyph">{profile?.emoji?.char ?? profile?.mono?.letters}</span>
    {/if}
  </span>
  {#if dot}<span class="avatar-dot" data-dot={dot}></span>{/if}
</span>

<style>
  .wrap {
    position: relative;
    display: inline-grid;
  }
</style>
