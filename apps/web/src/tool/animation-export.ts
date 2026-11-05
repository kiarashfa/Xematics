// Animation exports (animated SVG, GIF, video), loaded on first use by actions.ts.

import {
  buildTimeline,
  GifWriter,
  renderAnimatedSvg,
  renderSvg,
  resolveTheme,
  sampleScene,
} from '@xematics/core';
import type { AnimationExport } from './actions.ts';
import { downloadBytes, downloadText, rasterizeRgba, recordVideo, videoFormat } from './browser.ts';
import { tool } from './state.svelte.ts';

/** The current animation on the export scene (outlined text, like every image export). */
async function animationScene() {
  const ready = await tool.exportScene();
  if (!ready || !tool.model) return undefined;
  const timeline = buildTimeline(ready.scene, resolveTheme(tool.model.style), tool.model.animation);
  return { scene: ready.scene, timeline };
}

const animatedName = (extension: string) =>
  tool.fileName(extension).replace(/\.[a-z0-9]+$/, `-animated.${extension}`);

/** Frame size: sharp, but bounded so long animations stay a reasonable file size. */
function frameSize(scene: { width: number; height: number }, longest: number, most: number) {
  const scale = Math.min(most, longest / Math.max(scene.width, scene.height));
  return { width: Math.round(scene.width * scale), height: Math.round(scene.height * scale) };
}

let exporting = false;

export async function exportAnimationNow(kind: AnimationExport): Promise<void> {
  if (exporting) return;
  const ready = await animationScene();
  if (!ready) return;
  const { scene, timeline } = ready;
  exporting = true;
  try {
    if (kind === 'svg') {
      downloadText(animatedName('svg'), renderAnimatedSvg(scene, timeline), 'image/svg+xml');
    } else if (kind === 'gif') {
      const fps = 12;
      const size = frameSize(scene, 720, 1.5);
      const count = Math.max(1, Math.ceil((timeline.duration / 1000) * fps));
      const frame = (i: number) =>
        rasterizeRgba(
          renderSvg(sampleScene(scene, timeline, (i * 1000) / fps)),
          size.width,
          size.height,
        );
      // The palette comes from frames spread over the loop; then every frame streams through.
      const samples = await Promise.all(
        Array.from({ length: Math.min(count, 12) }, (_, k) => frame(Math.floor((k * count) / 12))),
      );
      const writer = new GifWriter({ ...size, delay: 1000 / fps, loop: timeline.loop }, samples);
      for (let i = 0; i < count; i++) {
        writer.add(await frame(i));
        if (i % 12 === 0) tool.flash(`Making the GIF: ${Math.round((i / count) * 100)}%`);
      }
      downloadBytes(animatedName('gif'), writer.finish(), 'image/gif');
      tool.flash('GIF saved.');
    } else {
      const format = videoFormat();
      if (!format) {
        tool.flash('This browser cannot record video. Try the GIF or the animated SVG.');
        return;
      }
      const size = frameSize(scene, 1600, 2);
      const seconds = Math.round(timeline.duration / 100) / 10;
      tool.flash(`Recording the video (${seconds} s)…`);
      const bytes = await recordVideo(
        (ms) => renderSvg(sampleScene(scene, timeline, ms)),
        { ...size, duration: timeline.duration, fps: 30, type: format.type },
        () => {},
      );
      downloadBytes(animatedName(format.extension), bytes, format.type.split(';')[0]!);
      tool.flash('Video saved.');
    }
  } catch (error) {
    tool.flash(error instanceof Error ? error.message : 'The animation could not be exported.');
  } finally {
    exporting = false;
  }
}
