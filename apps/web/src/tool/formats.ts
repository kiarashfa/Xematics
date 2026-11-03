// Export formats and their options, shared by the ribbon, the phone sheet and the dialogs.

export const EXPORT_FORMATS = [
  { id: 'svg', label: 'SVG', menu: 'SVG image', note: 'Vector, for the web and Inkscape' },
  { id: 'png', label: 'PNG', menu: 'PNG image', note: 'Image for slides and documents' },
  { id: 'pdf', label: 'PDF', menu: 'PDF document', note: 'Vector, for papers and print' },
  { id: 'tex', label: 'TikZ', menu: 'TikZ for LaTeX', note: 'LaTeX code (.tex)' },
  { id: 'json', label: 'JSON', menu: 'Model file', note: 'Opens again here (.json)' },
  { id: 'embed', label: 'Embed', menu: 'Embed code', note: 'Markdown, HTML or data URL' },
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number]['id'];

export function isExportFormat(value: unknown): value is ExportFormat {
  return EXPORT_FORMATS.some((f) => f.id === value);
}

/** PNG sizes as resolutions: 96 dpi is the figure's own size in CSS px. */
export const PNG_SIZES = [
  { dpi: 96, label: '1x' },
  { dpi: 192, label: '2x' },
  { dpi: 384, label: '4x' },
  { dpi: 300, label: '300 dpi' },
  { dpi: 600, label: '600 dpi' },
] as const;

export const DEFAULT_PNG_DPI = 300;

/** Browsers refuse larger canvases; bigger PNGs need the command line. */
export const MAX_PNG_PIXELS = 100_000_000;
