/** Escape a value for use inside a double-quoted XML attribute. */
export function attr(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Render ` key="value"` pairs, skipping empty values. */
export function attrs(map: Record<string, string | number | undefined | null>): string {
  return Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ` ${k}="${attr(v as string | number)}"`)
    .join('');
}

/**
 * Wrap a body in a tag. Bodies are Markdown and are deliberately NOT indented or
 * escaped: indentation would corrupt code fences, and escaping would mangle code.
 */
export function block(tag: string, map: Record<string, string | number | undefined | null>, body: string): string {
  return `<${tag}${attrs(map)}>\n${body.trim()}\n</${tag}>`;
}

/**
 * Rough token estimate. ~4 chars/token for English prose; code tokenizes denser,
 * so this is labelled "~" in the UI rather than presented as exact.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}

export function tidyMarkdown(md: string): string {
  return md
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
