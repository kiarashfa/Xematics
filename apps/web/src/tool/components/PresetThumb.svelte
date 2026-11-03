<script lang="ts">
  // A tiny diagram in a preset's own colors, drawn from the preset data so it never drifts.
  import { PRESETS, type PresetId } from '@xematics/core';

  let { id }: { id: PresetId } = $props();
  const theme = $derived(PRESETS[id]);
  const input = $derived(theme.roles.input);
  const hidden = $derived(theme.roles.hidden);
  const output = $derived(theme.roles.output);
</script>

<svg viewBox="0 0 44 30" aria-hidden="true">
  <rect width="44" height="30" rx="2" fill={theme.background ?? 'transparent'} />
  {#if theme.mode === 'boxes'}
    <g stroke={theme.box.arrow.color} fill={theme.box.arrow.color}>
      <path d="M12 15h5M27 15h5" />
      <path d="M19 15l-2.5-2v4zM34 15l-2.5-2v4z" stroke="none" />
    </g>
    <rect x="5" y="5" width="6" height="20" rx="1.5" fill={input.fill} stroke={input.stroke} />
    <rect x="20" y="9" width="6" height="12" rx="1.5" fill={hidden.fill} stroke={hidden.stroke} />
    <rect x="35" y="10.5" width="6" height="9" rx="1.5" fill={output.fill} stroke={output.stroke} />
  {:else}
    <path d="M8 9 22 15M8 21 22 15M22 15 36 9M22 15 36 21" stroke={theme.edge.color} />
    <circle cx="8" cy="9" r="3.4" fill={input.fill} stroke={input.stroke} />
    <circle cx="8" cy="21" r="3.4" fill={input.fill} stroke={input.stroke} />
    <circle cx="22" cy="15" r="3.4" fill={hidden.fill} stroke={hidden.stroke} />
    <circle cx="36" cy="9" r="3.4" fill={output.fill} stroke={output.stroke} />
    <circle cx="36" cy="21" r="3.4" fill={output.fill} stroke={output.stroke} />
  {/if}
</svg>

<style>
  svg {
    display: block;
    width: 46px;
    height: 32px;
  }
</style>
