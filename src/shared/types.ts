export type ClipKind = 'github-issue' | 'github-pr' | 'doc' | 'selection';

export interface ExtractOptions {
  includeDiff: boolean;
  maxDiffChars: number;
  skipBots: boolean;
  githubToken: string;
  /** Testing hook only: treat the page as if it lived at this URL. */
  urlOverride?: string;
}

export interface ExtractResult {
  ok: true;
  kind: ClipKind;
  title: string;
  url: string;
  payload: string;
  /** Where GitHub data came from: the REST API (complete) or the page DOM (best effort). */
  source?: 'api' | 'dom';
  warnings: string[];
}

export interface ExtractFailure {
  ok: false;
  error: string;
}

export type ExtractResponse = ExtractResult | ExtractFailure;

export interface ContextForgeGlobal {
  version: string;
  extract(opts: ExtractOptions): Promise<ExtractResponse>;
}
