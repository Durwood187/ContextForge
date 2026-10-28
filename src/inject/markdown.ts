import TurndownService from 'turndown';
import { strikethrough, tables, taskListItems } from 'turndown-plugin-gfm';
import { tidyMarkdown } from '../shared/format';

const NOT_A_LANGUAGE = new Set(['', 'text', 'plain', 'plaintext', 'none', 'txt', 'nohighlight', 'output']);

function cleanLang(raw: string | null | undefined): string {
  const lang = (raw ?? '').trim().toLowerCase().replace(/[^\w+#.-]/g, '');
  return NOT_A_LANGUAGE.has(lang) ? '' : lang;
}

/**
 * Find the language of a code block across the conventions we have seen in the wild:
 *   Docusaurus/Prism  pre.language-tsx, div.language-tsx
 *   GitHub            div.highlight-source-tsx > pre
 *   Mintlify/Shiki    pre[language="tsx"], code[language]
 *   rehype/Shiki      pre[data-language="tsx"]
 *   MDN               pre.brush: js
 */
export function detectLanguage(pre: Element): string {
  const candidates = [pre, pre.querySelector('code'), pre.parentElement, pre.parentElement?.parentElement];
  for (const el of candidates) {
    if (!el) continue;
    for (const name of ['data-language', 'data-lang', 'language', 'lang']) {
      const v = cleanLang(el.getAttribute(name));
      if (v) return v;
    }
    for (const cls of Array.from(el.classList)) {
      const m = cls.match(/^(?:language|lang)-(.+)$/) || cls.match(/^highlight-(?:source|text)-(.+)$/);
      if (m) {
        const v = cleanLang(m[1]);
        if (v) return v;
      }
    }
    const brush = (el.getAttribute('class') ?? '').match(/brush:\s*([\w+#-]+)/);
    if (brush) return cleanLang(brush[1]);
  }
  return '';
}

const LINE_SELECTOR = '.token-line, span.line, [data-line]';
const CODE_NOISE =
  'button, .line-number, .linenumber, .lineNumber, .react-syntax-highlighter-line-number, ' +
  '.copy-button, clipboard-copy, .zeroclipboard-container';

/** Plain text of a highlighted block, with line breaks preserved. */
function codeText(pre: Element): string {
  const work = pre.cloneNode(true) as Element;
  work.querySelectorAll(CODE_NOISE).forEach((n) => n.remove());
  work.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  const scope = work.querySelector('code') ?? work;

  let text = scope.textContent ?? '';
  // Some highlighters render one element per line with no newline characters
  // (Docusaurus uses <br>, handled above; others rely on display:block).
  const lines = Array.from(scope.querySelectorAll(LINE_SELECTOR)).filter(
    (l) => !l.parentElement?.closest(LINE_SELECTOR),
  );
  const newlines = (text.match(/\n/g) ?? []).length;
  if (lines.length > 1 && newlines < lines.length - 1) {
    text = lines.map((l) => (l.textContent ?? '').replace(/\n$/, '')).join('\n');
  }
  return text.replace(/\n+$/, '');
}

/**
 * Replace every <pre> under root with a canonical <pre><code class="language-x">.
 * Turndown's fenced-code rule reads the language-* class, so this is what makes
 * ```tsx survive conversion.
 */
export function normalizeCodeBlocks(root: Element): void {
  const doc = root.ownerDocument;
  for (const pre of Array.from(root.querySelectorAll('pre'))) {
    if (pre.parentElement?.closest('pre')) continue;
    const lang = detectLanguage(pre);
    const text = codeText(pre);
    const fresh = doc.createElement('pre');
    const code = doc.createElement('code');
    if (lang) code.className = `language-${lang}`;
    code.textContent = text;
    fresh.appendChild(code);
    pre.replaceWith(fresh);
  }
}

/** Rewrite relative href/src to absolute so links still work outside the page. */
export function absolutizeUrls(root: Element, base: string): void {
  for (const a of Array.from(root.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#') || /^javascript:/i.test(href)) {
      a.removeAttribute('href');
      continue;
    }
    try {
      a.setAttribute('href', new URL(href, base).href);
    } catch {
      /* leave as-is */
    }
  }
  for (const img of Array.from(root.querySelectorAll('img[src]'))) {
    try {
      img.setAttribute('src', new URL(img.getAttribute('src') ?? '', base).href);
    } catch {
      /* leave as-is */
    }
  }
}

let service: TurndownService | null = null;

function getService(): TurndownService {
  if (service) return service;
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
  });
  td.use([tables, strikethrough, taskListItems]);
  td.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'button', 'template', 'form', 'input', 'select', 'textarea']);

  // An LLM can't see pixels: keep images only when they carry alt text, and never inline data: URIs.
  td.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      const alt = (node.getAttribute('alt') ?? '').trim().replace(/\s+/g, ' ');
      if (!alt) return '';
      const src = node.getAttribute('src') ?? '';
      return src && !src.startsWith('data:') ? `![${alt}](${src})` : `[image: ${alt}]`;
    },
  });

  // Links whose text is just an icon/anchor glyph add noise.
  td.addRule('emptyLinks', {
    filter: (node) => node.nodeName === 'A' && !(node.textContent ?? '').trim() && !node.querySelector('img[alt]'),
    replacement: () => '',
  });

  // Turndown's default "-   item" wastes tokens; use "- item" with matching continuation indent.
  td.addRule('listItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement | null;
      let prefix = `${options.bulletListMarker} `;
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1);
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, '\n' + ' '.repeat(prefix.length));
      const trailing = node.nextSibling && !/\n$/.test(body) ? '\n' : '';
      return prefix + body + trailing;
    },
  });

  // GitHub-style <details>: keep the content, label the summary.
  td.addRule('details', {
    filter: 'summary',
    replacement: (content) => `\n\n**${content.trim()}**\n\n`,
  });

  service = td;
  return td;
}

/** Convert an (already cloned + cleaned) element to Markdown. */
export function toMarkdown(root: Element, baseUrl: string): string {
  normalizeCodeBlocks(root);
  absolutizeUrls(root, baseUrl);
  return tidyMarkdown(getService().turndown(root));
}
