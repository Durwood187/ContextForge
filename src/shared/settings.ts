export interface Settings {
  includeDiff: boolean;
  maxDiffChars: number;
  skipBots: boolean;
  /** Optional fine-grained read-only token: lifts the 60 req/hr limit and unlocks private repos via the API. */
  githubToken: string;
  /** Optional text prepended to every clip (e.g. "You are reviewing this PR…"). */
  customPrompt: string;
  customPromptEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  includeDiff: true,
  maxDiffChars: 60_000,
  skipBots: true,
  githubToken: '',
  customPrompt: '',
  customPromptEnabled: false,
};

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...((settings as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
