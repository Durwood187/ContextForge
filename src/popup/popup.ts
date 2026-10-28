import { finalizePayload, isRestrictedUrl, runExtraction } from '../shared/clip';
import { estimateTokens, formatCount } from '../shared/format';
import { getSettings, saveSettings, type Settings } from '../shared/settings';
import type { ClipKind, ExtractResult } from '../shared/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KIND_LABEL: Record<ClipKind, string> = {
  'github-pr': 'GitHub PR',
  'github-issue': 'GitHub Issue',
  doc: 'Docs / Article',
  selection: 'Selection',
};

let result: ExtractResult | null = null;
let tabId: number | undefined;

// ───────── rendering ─────────

function renderCopyButton() {
  $<HTMLButtonElement>('copy').disabled = !result;
}

function showError(message: string) {
  $('kind').textContent = 'Not clippable';
  $('title').textContent = '';
  const e = $('error');
  e.textContent = message;
  e.hidden = false;
}

async function renderResult(r: ExtractResult) {
  result = r;
  const finalText = await finalizePayload(r.payload);
  $('kind').textContent = KIND_LABEL[r.kind] + (r.source === 'dom' ? ' · page' : r.source === 'api' ? ' · API' : '');
  $('title').textContent = r.title;
  try {
    $('host').textContent = new URL(r.url).host;
  } catch {
    /* ignore */
  }
  $('chars').textContent = finalText.length.toLocaleString();
  $('tokens').textContent = '~' + formatCount(estimateTokens(finalText));
  $('stats').hidden = false;
  $('preview').textContent = finalText;
  $('previewWrap').hidden = false;

  const list = $('warnings');
  list.replaceChildren(...r.warnings.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
  list.hidden = r.warnings.length === 0;
  $('error').hidden = true;
  renderCopyButton();
}

async function clip() {
  if (tabId === undefined) return;
  $('kind').textContent = 'Reading page…';
  $<HTMLButtonElement>('copy').disabled = true;
  const r = await runExtraction(tabId);
  if (r.ok) await renderResult(r);
  else showError(r.error);
}

// ───────── actions ─────────

async function copy() {
  if (!result) return;
  const text = await finalizePayload(result.payload);
  const btn = $<HTMLButtonElement>('copy');
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    showError(`Clipboard write failed: ${(e as Error).message}`);
    return;
  }
  btn.textContent = 'Copied ✓';
  btn.classList.add('done');
  setTimeout(() => window.close(), 800);
}

async function renderShortcut() {
  const el = $('shortcut');
  const cmd = (await chrome.commands.getAll()).find((c) => c.name === 'copy-context');
  if (cmd?.shortcut) {
    el.innerHTML = '';
    const kbd = document.createElement('kbd');
    kbd.textContent = cmd.shortcut;
    el.append(kbd, ' clips without opening this');
  } else {
    el.textContent = 'Set a keyboard shortcut';
  }
  el.onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

// ───────── settings ─────────

/**
 * Settings writes are serialised through one promise chain: saveSettings() does a
 * read-modify-write, so two quick edits could otherwise clobber each other, and the
 * re-clip after "Done" must wait for the last write to land.
 */
let pendingSave: Promise<unknown> = Promise.resolve();
const queueSave = (patch: Partial<Settings>) => {
  pendingSave = pendingSave.then(() => saveSettings(patch));
  return pendingSave;
};

async function bindSettings() {
  const s = await getSettings();
  const bool = (id: keyof Settings) => {
    const el = $<HTMLInputElement>(id);
    el.checked = Boolean(s[id]);
    el.onchange = () => queueSave({ [id]: el.checked });
  };
  const text = (id: keyof Settings, parse: (v: string) => unknown = (v) => v) => {
    const el = $<HTMLInputElement | HTMLTextAreaElement>(id);
    el.value = String(s[id] ?? '');
    // 'input' saves as you type/paste, so nothing depends on the field losing focus first.
    el.oninput = el.onchange = () => queueSave({ [id]: parse(el.value) } as Partial<Settings>);
  };
  bool('includeDiff');
  bool('skipBots');
  bool('customPromptEnabled');
  text('githubToken', (v) => v.trim());
  text('customPrompt');
  text('maxDiffChars', (v) => Math.max(5000, Number(v) || 60_000));
}

async function toggleSettings(open: boolean) {
  $('settings').hidden = !open;
  $('main').hidden = open;
  if (!open) {
    await pendingSave; // settings may change the output (diff, bots, token, wrapper)
    await clip();
  }
}

// ───────── boot ─────────

async function init() {
  $('copy').addEventListener('click', copy);
  $('openSettings').addEventListener('click', () => void toggleSettings(true));
  $('closeSettings').addEventListener('click', () => void toggleSettings(false));

  await Promise.all([renderShortcut(), bindSettings()]);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || isRestrictedUrl(tab.url)) {
    showError('Chrome does not let extensions read this page. Open a GitHub PR/issue or a docs page.');
    return;
  }
  tabId = tab.id;
  await clip();
}

void init();
