import { Readability } from '@mozilla/readability';
import { block } from '../shared/format';
import type { ExtractResult } from '../shared/types';
import { normalizeCodeBlocks, toMarkdown } from './markdown';

/**
 * Known documentation content containers, most specific first. Verified against
 * live sites (Oct 2026): Docusaurus → .theme-doc-markdown, Mintlify → #content-area
 * (includes the page header) / .mdx-content, Nextra → article / main[data-pagefind-body].
 */
const CONTAINER_SELECTORS = [
  '.theme-doc-markdown',
  '#content-area',
  '.mdx-content',
  '.mintlify-content',
  '.nextra-content',
  'main[data-pagefind-body]',
  'main article',
  'article',
  '[role="main"]',
  'main',
  '#content',
  '.markdown-body',
];

const MIN_CONTENT_CHARS = 200;

/** Chrome that sits inside content containers on popular doc frameworks. */
const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'template', 'form', 'button', 'dialog',
  'nav', 'footer',
  '[role="navigation"]', '[role="complementary"]', '[role="search"]', '[role="dialog"]',
  '.theme-doc-toc-mobile', '.theme-doc-toc-desktop', '.theme-doc-footer', '.theme-doc-breadcrumbs',
  '.theme-edit-this-page', '.theme-last-updated', '.pagination-nav', '.breadcrumbs',
  '[aria-label*="breadcrumb" i]', '[role="tablist"]', '.hash-link', 'a.anchor', '.header-anchor', '.heading-anchor',
  '#pagination', '#footer', '.feedback-toolbar', '[data-feedback]',
  '.sr-only', '.visually-hidden',
].join(',');

function pickContainer(): Element | null {
  for (const sel of CONTAINER_SELECTORS) {
    let best: Element | null = null;
    let bestLen = 0;
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const len = (el as HTMLElement).innerText?.length ?? 0;
      if (len > bestLen) {
        best = el;
        bestLen = len;
      }
    }
    if (best && bestLen >= MIN_CONTENT_CHARS) return best;
  }
  return null;
}

/**
 * Clone an element, dropping descendants that are not rendered (inactive tabs,
 * mobile-only menus, visually-hidden text). Content inside closed <details> is kept.
 */
function cloneVisible(source: Element): Element {
  const clone = source.cloneNode(true) as Element;
  const originals = Array.from(source.querySelectorAll('*'));
  const copies = Array.from(clone.querySelectorAll('*'));
  if (originals.length !== copies.length) return clone; // DOM mutated mid-clone; skip pruning
  const doomed: Element[] = [];
  originals.forEach((el, i) => {
    if (el.closest('details') || el.closest('pre')) return;
    const visible = (el as HTMLElement).checkVisibility?.({ visibilityProperty: true } as CheckVisibilityOptions) ?? true;
    if (!visible) doomed.push(copies[i]);
  });
  doomed.forEach((el) => el.remove());
  return clone;
}

/**
 * <aside> is a table of contents on some sites and a callout ("Note:") on others
 * (e.g. Astro Starlight). Drop it only when it is mostly links.
 */
function pruneNavLikeAsides(root: Element): void {
  for (const aside of Array.from(root.querySelectorAll('aside'))) {
    const text = (aside.textContent ?? '').replace(/\s+/g, '').length;
    const linkText = Array.from(aside.querySelectorAll('a'))
      .map((a) => (a.textContent ?? '').replace(/\s+/g, '').length)
      .reduce((a, b) => a + b, 0);
    if (text === 0 || linkText / text > 0.5) aside.remove();
  }
}

function pageTitle(container: Element | null): string {
  const h1 = container?.querySelector('h1') ?? document.querySelector('main h1, article h1, h1');
  const fromH1 = h1?.textContent?.trim();
  if (fromH1) return fromH1;
  return document.title.split(/\s[|–—-]\s/)[0].trim() || document.title;
}

function viaReadability(warnings: string[]): { el: Element; title: string } | null {
  const docClone = document.cloneNode(true) as Document;
  // Normalise code before Readability strips class names, and tell it to keep ours.
  normalizeCodeBlocks(docClone.body);
  const keep = new Set<string>();
  docClone.querySelectorAll('pre code[class]').forEach((c) => c.classList.forEach((k) => keep.add(k)));
  const article = new Readability(docClone, { classesToPreserve: [...keep], keepClasses: false }).parse();
  if (!article?.content) return null;
  warnings.push('No known docs layout detected; used generic article detection.');
  const holder = document.createElement('div');
  holder.innerHTML = article.content; // detached node: scripts don't execute
  return { el: holder, title: article.title ?? '' };
}

export function extractSelection(url: string): ExtractResult | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
  const holder = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) holder.appendChild(sel.getRangeAt(i).cloneContents());
  // A selection inside a single code block clones as bare text; keep it fenced.
  const anchorPre = sel.anchorNode?.parentElement?.closest('pre');
  let md = toMarkdown(holder, url);
  if (anchorPre && !holder.querySelector('pre')) {
    const lang = anchorPre.querySelector('code')?.className.match(/language-(\S+)/)?.[1] ?? '';
    md = '```' + lang + '\n' + sel.toString().replace(/\n+$/, '') + '\n```';
  }
  const title = document.title;
  return {
    ok: true,
    kind: 'selection',
    title,
    url,
    payload: block('document', { url, title, scope: 'selection' }, md),
    warnings: ['Clipped your text selection only. Clear the selection to clip the whole page.'],
  };
}

export function extractDocument(url: string): ExtractResult {
  const warnings: string[] = [];
  const container = pickContainer();
  let root: Element;
  let title = pageTitle(container);

  if (container) {
    root = cloneVisible(container);
  } else {
    const r = viaReadability(warnings);
    if (r) {
      root = r.el;
      title = r.title || title;
    } else {
      root = cloneVisible(document.body);
      warnings.push('Could not find a main content area; clipped the whole page body.');
    }
  }
  root.querySelectorAll(NOISE_SELECTORS).forEach((n) => n.remove());
  pruneNavLikeAsides(root);

  const hasH1 = !!root.querySelector('h1');
  const md = toMarkdown(root, url);
  if (md.length < MIN_CONTENT_CHARS) {
    warnings.push('Very little text was found. The page may still be loading or render content in a canvas/iframe.');
  }
  // Prepend the title if the extracted content does not already start with it.
  const body = hasH1 || md.startsWith('# ') ? md : `# ${title}\n\n${md}`;
  return {
    ok: true,
    kind: 'doc',
    title,
    url,
    payload: block('document', { url, title }, body),
    warnings,
  };
}
