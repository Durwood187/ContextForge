import { getSettings } from './settings';
import type { ContextForgeGlobal, ExtractOptions, ExtractResponse } from './types';

const RESTRICTED = /^(chrome|edge|about|chrome-extension|devtools|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/;

export function isRestrictedUrl(url?: string): boolean {
  return !url || RESTRICTED.test(url);
}

/** Inject the extractor into the tab and run it. Requires activeTab (popup click or shortcut). */
export async function runExtraction(tabId: number): Promise<ExtractResponse> {
  const s = await getSettings();
  const opts: ExtractOptions = {
    includeDiff: s.includeDiff,
    maxDiffChars: s.maxDiffChars,
    skipBots: s.skipBots,
    githubToken: s.githubToken,
  };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['inject/extractor.js'] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (o: ExtractOptions) =>
        (window as unknown as { __contextforge: ContextForgeGlobal }).__contextforge.extract(o),
      args: [opts],
    });
    return (res?.result as ExtractResponse) ?? { ok: false, error: 'No result from page.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cannot access|cannot be scripted|extensions gallery/i.test(msg)) {
      return { ok: false, error: 'Chrome does not allow extensions to read this page.' };
    }
    if (/file:/.test(msg)) {
      return { ok: false, error: 'To clip local files, enable "Allow access to file URLs" for ContextForge.' };
    }
    return { ok: false, error: msg };
  }
}

/** Apply the optional prompt wrapper. */
export async function finalizePayload(payload: string): Promise<string> {
  const s = await getSettings();
  if (s.customPromptEnabled && s.customPrompt.trim()) {
    return `${s.customPrompt.trim()}\n\n${payload}`;
  }
  return payload;
}
