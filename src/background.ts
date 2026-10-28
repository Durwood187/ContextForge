/**
 * Service worker: handles the keyboard shortcut. Pressing the shortcut grants activeTab
 * for the current tab, which is all we need to inject, extract, copy and toast.
 */
import { finalizePayload, isRestrictedUrl, runExtraction } from './shared/clip';
import { estimateTokens, formatCount } from './shared/format';

type Tone = 'ok' | 'warn' | 'error';

/** Runs in the page. Must be self-contained (serialized by chrome.scripting). */
function pageToast(message: string, tone: Tone): void {
  const ID = '__contextforge_toast';
  document.getElementById(ID)?.remove();
  const host = document.createElement('div');
  host.id = ID;
  host.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  const colors: Record<Tone, string> = { ok: '#ff7a45', warn: '#f5b83d', error: '#ff5c5c' };
  root.innerHTML = `<style>
    .t{font:500 13px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#ececec;
       background:#151517;border:1px solid #2a2a2e;border-left:3px solid ${colors[tone]};
       border-radius:8px;padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.35);
       max-width:360px;opacity:0;transform:translateY(6px);transition:opacity .18s,transform .18s}
    .t.in{opacity:1;transform:none}
    b{color:${colors[tone]};font-weight:600;margin-right:6px}
  </style><div class="t"><b>ContextForge</b><span></span></div>`;
  (root.querySelector('span') as HTMLSpanElement).textContent = message;
  document.documentElement.appendChild(host);
  const el = root.querySelector('.t') as HTMLDivElement;
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => host.remove(), 250);
  }, 2800);
}

/** Runs in the page. The shortcut gives the page focus, so the async Clipboard API usually works. */
async function pageCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const active = document.activeElement as HTMLElement | null;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy'); // allowed for extensions with clipboardWrite
    } finally {
      ta.remove();
      active?.focus?.();
    }
    return ok;
  }
}

async function toast(tabId: number, message: string, tone: Tone = 'ok') {
  await chrome.scripting.executeScript({ target: { tabId }, func: pageToast, args: [message, tone] }).catch(() => undefined);
}

async function flashBadge(text: string, color: string) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'copy-context') return;
  const target = tab?.id ? tab : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!target?.id) return;
  const tabId = target.id;

  if (isRestrictedUrl(target.url)) {
    await flashBadge('✕', '#ff5c5c');
    return;
  }
  const res = await runExtraction(tabId);
  if (!res.ok) {
    await toast(tabId, res.error, 'error');
    return;
  }
  const text = await finalizePayload(res.payload);
  const [copy] = await chrome.scripting
    .executeScript({ target: { tabId }, func: pageCopy, args: [text] })
    .catch(() => [{ result: false }]);
  if (!copy?.result) {
    await toast(tabId, 'Could not write to the clipboard. Try the toolbar button instead.', 'error');
    return;
  }
  const note = res.source === 'dom' ? ' · partial (page DOM)' : '';
  await toast(tabId, `Context copied to clipboard (~${formatCount(estimateTokens(text))} tokens)${note}`);
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.action.setBadgeText({ text: '' });
});
