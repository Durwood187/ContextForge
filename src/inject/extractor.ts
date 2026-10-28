/**
 * Injected on demand into the active tab (chrome.scripting.executeScript, via activeTab).
 * Registers window.__contextforge; the caller then invokes extract() in a second call.
 * Nothing runs on any page until the user clicks the toolbar button or presses the shortcut.
 */
import type { ContextForgeGlobal, ExtractOptions, ExtractResponse } from '../shared/types';
import { extractDocument, extractSelection } from './docs';
import { extractGitHub, parseGitHubUrl } from './github';

const VERSION = '1.0.0';

async function extract(opts: ExtractOptions): Promise<ExtractResponse> {
  try {
    const url = opts.urlOverride ?? location.href;
    const selection = extractSelection(url);
    if (selection) return selection;
    const gh = parseGitHubUrl(url);
    if (gh) return await extractGitHub(gh, opts, url);
    if (document.contentType && !/html/.test(document.contentType)) {
      return { ok: false, error: `Can't clip this page type (${document.contentType}).` };
    }
    return extractDocument(url);
  } catch (e) {
    console.error('[ContextForge]', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const w = window as unknown as { __contextforge?: ContextForgeGlobal };
if (!w.__contextforge || w.__contextforge.version !== VERSION) {
  w.__contextforge = { version: VERSION, extract };
}
