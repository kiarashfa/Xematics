const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Control characters, noncharacters and lone surrogates are not allowed in XML 1.0.
const INVALID_XML = new RegExp(
  [
    '[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]',
    '[\uD800-\uDBFF](?![\uDC00-\uDFFF])',
    '(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]',
  ].join('|'),
  'g',
);

export function stripInvalidXml(text: string): string {
  return text.replace(INVALID_XML, '');
}

/** Escapes text for use in XML content and attribute values. */
export function escapeXml(text: string): string {
  return stripInvalidXml(text).replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}
