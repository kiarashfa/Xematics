<script lang="ts">
  import { player } from '../player.ts';
  import { tool } from '../state.svelte.ts';
  import Icon from './Icon.svelte';

  const duration = $derived(tool.timeline?.duration ?? 1);
  const clock = (ms: number) => {
    const seconds = ms / 1000;
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
  };

  function seek(event: Event) {
    const ms = Number((event.currentTarget as HTMLInputElement).value);
    tool.time = ms;
    player.seek(ms);
  }
</script>

<!-- Keeps a drag on the slider from panning the preview. -->
<div
  class="scrubber"
  role="group"
  aria-label="Animation player"
  onpointerdown={(e) => e.stopPropagation()}
>
  <button
    type="button"
    aria-label={tool.playing ? 'Pause animation' : 'Play animation'}
    onclick={() => (tool.playing = !tool.playing)}
    ><Icon name={tool.playing ? 'pause' : 'play'} size={16} /></button
  >
  <input
    type="range"
    min="0"
    max={duration}
    step="10"
    value={tool.time}
    oninput={seek}
    aria-label="Animation time"
  />
  <output aria-live="off">{clock(tool.time)} / {clock(duration)}</output>
</div>

<style>
  .scrubber {
    position: sticky;
    left: 12px;
    bottom: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(560px, calc(100% - 24px));
    margin: 0 auto;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
    cursor: default;
  }

  button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--bg);
    color: var(--ink);
  }

  input {
    flex: 1;
    min-width: 0;
    accent-color: var(--accent);
  }

  output {
    font: 0.75rem var(--font-mono);
    color: var(--muted);
    white-space: nowrap;
  }
</style>
