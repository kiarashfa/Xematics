// Small browser helpers used by the editor.

/** Saves text as a file through the browser's normal download flow. */
export function downloadText(fileName: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves bytes (PNG, PDF) as a file. */
export function downloadBytes(fileName: string, content: Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([content as Uint8Array<ArrayBuffer>], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Draws an SVG into a canvas of the given pixel size and returns PNG bytes. */
export async function rasterize(svg: string, width: number, height: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(width, height);
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot draw images.');
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('This browser could not make the PNG image.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function copyText(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

const THEME_KEY = 'xm-theme';

export function currentTheme(): 'light' | 'dark' {
  const stored = document.documentElement.dataset['theme'];
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Same behavior as the site's theme toggle: the choice is stored locally only. */
export function setTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset['theme'] = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked; the choice then lasts for this page view.
  }
}

/** Loads an SVG as an image of the given pixel size. */
async function svgImage(svg: string, width: number, height: number): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(width, height);
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // The decoded image stays usable after the URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Draws an SVG into a canvas and returns its RGBA pixels (for GIF frames). */
export async function rasterizeRgba(
  svg: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const image = await svgImage(svg, width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser cannot draw images.');
  context.drawImage(image, 0, 0, width, height);
  return new Uint8Array(context.getImageData(0, 0, width, height).data.buffer);
}

/** The video format this browser can record, or undefined. WebM first, MP4 where only that works. */
export function videoFormat(): { type: string; extension: string } | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const [type, extension] of [
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm', 'webm'],
    ['video/mp4', 'mp4'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(type)) return { type, extension };
  }
  return undefined;
}

/**
 * Records frames into a video in real time: `frame(ms)` returns the SVG for that moment, drawn at
 * `fps` on a canvas whose stream is recorded. Resolves with the video bytes.
 */
export async function recordVideo(
  frame: (ms: number) => string,
  options: { width: number; height: number; duration: number; fps: number; type: string },
  progress: (fraction: number) => void,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw images.');
  const draw = async (ms: number) => {
    const image = await svgImage(frame(ms), options.width, options.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, options.width, options.height);
    context.drawImage(image, 0, 0, options.width, options.height);
  };
  await draw(0);
  const stream = canvas.captureStream(options.fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: options.type,
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start();
  const start = performance.now();
  // Frames are drawn on time; a slow frame is skipped rather than stretching the video.
  for (;;) {
    const elapsed = performance.now() - start;
    if (elapsed >= options.duration) break;
    await draw(elapsed);
    progress(elapsed / options.duration);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1000 / options.fps - 4)));
  }
  recorder.stop();
  await stopped;
  for (const track of stream.getTracks()) track.stop();
  return new Uint8Array(await new Blob(chunks, { type: options.type }).arrayBuffer());
}
