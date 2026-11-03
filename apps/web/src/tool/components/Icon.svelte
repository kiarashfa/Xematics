<script lang="ts" module>
  const PATHS = {
    undo: 'M9 14 4 9l5-5|M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5|M20 9H10a6 6 0 0 0 0 12h3',
    plus: 'M12 5v14|M5 12h14',
    minus: 'M5 12h14',
    trash: 'M4 7h16|M9 7V4h6v3|M6 7l1 13h10l1-13',
    left: 'M15 6l-6 6 6 6',
    right: 'M9 6l6 6-6 6',
    download: 'M12 3v12|M7 10l5 5 5-5|M5 21h14',
    copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
    file: 'M6 2h8l5 5v15H6z|M14 2v5h5',
    open: 'M3 7h6l2 2h10v11H3z',
    sun: 'M12 3v2|M12 19v2|M3 12h2|M19 12h2|M5.6 5.6l1.4 1.4|M17 17l1.4 1.4|M5.6 18.4 7 17|M17 7l1.4-1.4|M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    fit: 'M4 9V4h5|M20 9V4h-5|M4 15v5h5|M20 15v5h-5',
    check: 'M5 12l5 5 9-10',
    alert: 'M12 3 2 21h20z|M12 10v5|M12 18h.01',
    panelLeft: 'M3 4h18v16H3z|M9 4v16',
    panelRight: 'M3 4h18v16H3z|M15 4v16',
    layers: 'M12 3 3 8l9 5 9-5z|M3 13l9 5 9-5',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14|M12 17h.01',
    external: 'M14 4h6v6|M20 4l-9 9|M18 14v6H4V6h6',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7|M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  } as const;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  {#each PATHS[name].split('|') as d (d)}
    <path {d} />
  {/each}
</svg>

<style>
  .icon {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
