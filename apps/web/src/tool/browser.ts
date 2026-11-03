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
