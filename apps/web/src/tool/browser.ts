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
