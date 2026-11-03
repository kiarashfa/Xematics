/** A problem found while reading or laying out a diagram. Messages are shown to users as-is. */
export interface Diagnostic {
  readonly severity: 'error' | 'warning';
  /** Stable machine-readable identifier, for example `shorthand.expected-size`. */
  readonly code: string;
  readonly message: string;
  /** 1-based position in the input text, when known. */
  readonly line?: number;
  readonly column?: number;
  /** Path inside the model, for example `['layers', 1, 'units']`. */
  readonly path?: readonly (string | number)[];
}

export interface DiagnosticLocation {
  readonly line?: number | undefined;
  readonly column?: number | undefined;
  readonly path?: readonly (string | number)[] | undefined;
}

export function diagnostic(
  severity: Diagnostic['severity'],
  code: string,
  message: string,
  at: DiagnosticLocation = {},
): Diagnostic {
  // Messages may carry text from libraries; public text never contains em-dashes.
  const result: { -readonly [K in keyof Diagnostic]: Diagnostic[K] } = {
    severity,
    code,
    message: message.replaceAll('\u2014', '-'),
  };
  if (at.line !== undefined) result.line = at.line;
  if (at.column !== undefined) result.column = at.column;
  if (at.path !== undefined) result.path = at.path;
  return result;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/** Formats a diagnostic as `source:line:column: severity: message`. */
export function formatDiagnostic(d: Diagnostic, source = 'input'): string {
  const where = d.line === undefined ? source : `${source}:${d.line}:${d.column ?? 1}`;
  return `${where}: ${d.severity}: ${d.message}`;
}
