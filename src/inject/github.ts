import { attrs, block } from '../shared/format';
import type { ExtractOptions, ExtractResult } from '../shared/types';
import { toMarkdown } from './markdown';

// ───────────────────────────── types ─────────────────────────────

export interface GitHubRef {
  owner: string;
  repo: string;
  number: number;
  /** URL segment. GitHub redirects /issues/N <-> /pull/N, so the API decides the real type. */
  segment: 'issues' | 'pull' | 'discussions';
}

interface Comment {
  author: string;
  date?: string;
  body: string;
  kind?: 'comment' | 'review';
  reviewState?: string;
}

interface Thread {
  path?: string;
  line?: number | null;
  hunk?: string;
  comments: Comment[];
}

interface GitHubData {
  type: 'issue' | 'pull_request' | 'discussion';
  url: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  state?: string;
  labels: string[];
  base?: string;
  head?: string;
  description: string;
  comments: Comment[];
  threads: Thread[];
  diff?: { text: string; note?: string };
}

// ───────────────────────────── url parsing ─────────────────────────────

export function parseGitHubUrl(href: string): GitHubRef | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.hostname !== 'github.com') return null;
  const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(issues|pull|discussions)\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], segment: m[3] as GitHubRef['segment'], number: Number(m[4]) };
}

// ───────────────────────────── helpers ─────────────────────────────

const isBot = (login: string, href = '') => /\[bot\]$/i.test(login) || href.includes('/apps/');
const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : undefined);
const PLACEHOLDER_BODY = /^_?No (description|response) provided\._?$/i;

/**
 * Remove issue/PR template noise that costs tokens and tells a model nothing:
 * <!-- instructions -->, raw <img> tags, empty "_No response_" sections from
 * GitHub issue forms, and a trailing all-ticked "Validations" checklist.
 */
export function cleanBody(raw: string): string {
  let md = raw
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const alt = tag.match(/\balt\s*=\s*"([^"]*)"/i)?.[1]?.trim() ?? '';
      return /^(|image|img|screenshot|screen shot.*|untitled)$/i.test(alt) ? '[image]' : `[image: ${alt}]`;
    });
  // "### Alternative\n\n_No response_" → drop heading + placeholder.
  md = md.replace(/^#{1,6}[^\n]*\n+_No response_[ \t]*(\n+|$)/gim, '');
  // Trailing "### Validations" (or similar) where every checkbox is ticked.
  md = md.replace(/\n#{1,6}\s*(Validations|Checklist|Code of Conduct)[^\n]*\n+((?:[-*] \[[xX]\][^\n]*(?:\n|$))+)\s*$/i, '\n');
  md = md.trim();
  return PLACEHOLDER_BODY.test(md) ? '' : md.replace(/\n{3,}/g, '\n\n');
}

/** Fence that cannot be closed early by backticks inside the content. */
function fence(lang: string, text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const f = '`'.repeat(longest + 1);
  return `${f}${lang}\n${text.replace(/\n+$/, '')}\n${f}`;
}

/** Lockfiles and build output bloat the diff without telling a model anything. */
const NOISY_DIFF_PATH = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$|\.min\.(js|css)$|(^|\/)(dist|build|vendor)\//;

export function trimDiff(raw: string, maxChars: number): { text: string; note?: string } {
  const files = raw.split(/(?=^diff --git )/m).filter(Boolean);
  const kept: string[] = [];
  const skipped: string[] = [];
  const dropped: string[] = [];
  let size = 0;
  for (const f of files) {
    const path = f.match(/^diff --git a\/(\S+)/)?.[1] ?? '';
    if (NOISY_DIFF_PATH.test(path)) {
      skipped.push(path);
      continue;
    }
    if (size + f.length > maxChars) {
      dropped.push(path);
      continue;
    }
    kept.push(f);
    size += f.length;
  }
  const notes: string[] = [];
  if (skipped.length) notes.push(`omitted generated/lock files: ${skipped.join(', ')}`);
  if (dropped.length) notes.push(`omitted to stay under ${maxChars.toLocaleString()} chars: ${dropped.join(', ')}`);
  return { text: kept.join(''), note: notes.join('; ') || undefined };
}

// ───────────────────────────── REST API path ─────────────────────────────

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api(path: string, token: string, accept = 'application/vnd.github+json'): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, credentials: 'omit' });
  if (res.ok) return res;
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new ApiError(res.status, token
      ? 'GitHub API rate limit reached for your token.'
      : 'GitHub API rate limit reached (60 requests/hour without a token).');
  }
  if (res.status === 404) {
    throw new ApiError(404, token
      ? 'GitHub API could not see this repo with your token.'
      : 'Repo is private (or not visible to the public GitHub API).');
  }
  if (res.status === 401) throw new ApiError(401, 'GitHub token was rejected (expired, revoked, or not fully pasted?).');
  const ghMessage = ((await res.json().catch(() => ({}))) as { message?: string }).message;
  if (res.status === 403 && token) {
    throw new ApiError(403, `GitHub refused the token${ghMessage ? ` ("${ghMessage}")` : ''}. ` +
      'It needs read-only Issues, Pull requests, and Contents access to this repo.');
  }
  throw new ApiError(res.status, `GitHub API returned ${res.status}${ghMessage ? `: ${ghMessage}` : ''}.`);
}

async function paginate<T>(path: string, token: string, maxPages = 5): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let next: string | null = `${path}${path.includes('?') ? '&' : '?'}per_page=100`;
  let pages = 0;
  while (next && pages < maxPages) {
    const res = await api(next, token);
    items.push(...((await res.json()) as T[]));
    pages++;
    const link = res.headers.get('link') ?? '';
    const m = link.match(/<https:\/\/api\.github\.com([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return { items, truncated: next !== null };
}

/* Shapes of the fields we read from the REST API. */
interface ApiUser { login: string; type?: string }
interface ApiIssue {
  title: string; body: string | null; user: ApiUser; state: string; state_reason?: string | null;
  html_url: string; labels: Array<{ name: string } | string>; pull_request?: unknown;
}
interface ApiComment { user: ApiUser | null; body: string | null; created_at: string }
interface ApiPull { merged: boolean; draft?: boolean; base: { ref: string }; head: { ref: string; label: string } }
interface ApiReview { user: ApiUser | null; body: string | null; state: string; submitted_at: string | null }
interface ApiReviewComment {
  id: number; in_reply_to_id?: number; user: ApiUser | null; body: string; created_at: string;
  path: string; line: number | null; original_line: number | null; diff_hunk: string;
}

async function fromApi(ref: GitHubRef, opts: ExtractOptions, warnings: string[]): Promise<GitHubData> {
  const base = `/repos/${ref.owner}/${ref.repo}`;
  const t = opts.githubToken;
  const issue = (await (await api(`${base}/issues/${ref.number}`, t)).json()) as ApiIssue;
  const isPR = Boolean(issue.pull_request);
  const keep = (u: ApiUser | null) => !(opts.skipBots && u && (u.type === 'Bot' || isBot(u.login)));

  const commentsRes = await paginate<ApiComment>(`${base}/issues/${ref.number}/comments`, t);
  if (commentsRes.truncated) warnings.push('Only the first 500 comments were included.');
  let skippedBots = commentsRes.items.filter((c) => !keep(c.user)).length;

  const timeline: Array<Comment & { sortKey: string }> = commentsRes.items.filter((c) => keep(c.user)).map((c) => ({
    author: c.user?.login ?? 'ghost',
    date: day(c.created_at),
    body: cleanBody(c.body ?? ''),
    kind: 'comment' as const,
    sortKey: c.created_at,
  }));

  const data: GitHubData = {
    type: isPR ? 'pull_request' : 'issue',
    url: issue.html_url,
    repo: `${ref.owner}/${ref.repo}`,
    number: ref.number,
    title: issue.title,
    author: issue.user.login,
    state: issue.state_reason && issue.state === 'closed' ? `closed (${issue.state_reason})` : issue.state,
    labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name)),
    description: cleanBody(issue.body ?? ''),
    comments: [],
    threads: [],
  };

  if (isPR) {
    const [pullRes, reviewsRes, reviewCommentsRes] = await Promise.all([
      api(`${base}/pulls/${ref.number}`, t),
      paginate<ApiReview>(`${base}/pulls/${ref.number}/reviews`, t),
      paginate<ApiReviewComment>(`${base}/pulls/${ref.number}/comments`, t),
    ]);
    const pull = (await pullRes.json()) as ApiPull;
    data.base = pull.base.ref;
    data.head = pull.head.label;
    if (pull.merged) data.state = 'merged';
    else if (pull.draft && data.state === 'open') data.state = 'draft';

    for (const r of reviewsRes.items) {
      if (!keep(r.user)) { skippedBots++; continue; }
      const body = cleanBody(r.body ?? '');
      // Plain "COMMENTED" reviews with no summary just wrap inline comments (captured below).
      if (!body && !['APPROVED', 'CHANGES_REQUESTED'].includes(r.state)) continue;
      timeline.push({
        author: r.user?.login ?? 'ghost', date: day(r.submitted_at), body,
        kind: 'review', reviewState: r.state, sortKey: r.submitted_at ?? '',
      });
    }

    const byRoot = new Map<number, ApiReviewComment[]>();
    for (const c of reviewCommentsRes.items) {
      if (!keep(c.user)) { skippedBots++; continue; }
      const root = c.in_reply_to_id ?? c.id;
      byRoot.set(root, [...(byRoot.get(root) ?? []), c]);
    }
    for (const thread of byRoot.values()) {
      thread.sort((a, b) => a.created_at.localeCompare(b.created_at));
      const first = thread[0];
      data.threads.push({
        path: first.path,
        line: first.line ?? first.original_line,
        hunk: first.diff_hunk.split('\n').slice(-8).join('\n'),
        comments: thread.map((c) => ({ author: c.user?.login ?? 'ghost', date: day(c.created_at), body: cleanBody(c.body) })),
      });
    }

    if (opts.includeDiff) {
      try {
        const raw = await (await api(`${base}/pulls/${ref.number}`, t, 'application/vnd.github.diff')).text();
        data.diff = trimDiff(raw, opts.maxDiffChars);
      } catch (e) {
        warnings.push(`Diff not included: ${(e as Error).message}`);
      }
    }
  }

  timeline.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  data.comments = timeline.map(({ sortKey: _s, ...c }) => c);
  if (skippedBots) warnings.push(`Skipped ${skippedBots} bot comment(s). Toggle in Settings.`);
  return data;
}

// ───────────────────────────── DOM fallback path ─────────────────────────────

const COMMENT_CONTAINER =
  '[data-testid^="comment-viewer-outer-box"], [data-testid="issue-viewer-issue-container"], ' +
  '.review-comment, .timeline-comment, .js-comment-container, .TimelineItem';
const AUTHOR_LINK =
  '[data-testid="issue-body-header-author"], [data-testid="avatar-link"], a.author, .author';

function text(sel: string, root: ParentNode = document): string {
  return root.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function titleFromDocument(): { title: string; author: string } {
  // e.g. "Fix thing by octocat · Pull Request #12 · owner/repo · GitHub"
  const first = document.title.split(' · ')[0] ?? document.title;
  const m = first.match(/^(.*) by (\S+)$/);
  return m ? { title: m[1], author: m[2] } : { title: first, author: '' };
}

function fromDom(ref: GitHubRef, opts: ExtractOptions, url: string, warnings: string[]): GitHubData {
  const fallback = titleFromDocument();
  const title =
    text('[data-testid="issue-title"]') || text('h1 .markdown-title') || text('.js-issue-title') || fallback.title;

  const bodies = Array.from(document.querySelectorAll('.markdown-body')).filter((el) => {
    if (el.parentElement?.closest('.markdown-body')) return false; // nested
    if (el.closest('form, [hidden], .js-comment-edit-form, .comment-form-head')) return false;
    return (el as HTMLElement).checkVisibility?.() ?? true;
  });

  const comments: Comment[] = [];
  const threads = new Map<string, Thread>();
  let description: string | null = null;
  let author = '';
  let skippedBots = 0;

  for (const body of bodies) {
    const container = body.closest(COMMENT_CONTAINER);
    const link = container?.querySelector(AUTHOR_LINK) as HTMLAnchorElement | null;
    const who = link?.textContent?.replace(/\s+/g, ' ').trim() || 'unknown';
    const date = day(container?.querySelector('relative-time')?.getAttribute('datetime'));
    const clone = body.cloneNode(true) as Element;
    const md = cleanBody(toMarkdown(clone, url));

    const threadEl = body.closest('.review-thread-component, [data-path]');
    if (threadEl) {
      // Classic threads link the file header to /pull/N/files…#diff-<hash>.
      const path =
        threadEl.getAttribute('data-path') ||
        text('a[href*="/files"][href*="#diff-"]', threadEl) ||
        text('summary .text-mono, summary a, .file-info a', threadEl) ||
        'unknown file';
      if (!md) continue;
      const t = threads.get(path) ?? { path, comments: [] };
      t.comments.push({ author: who, date, body: md });
      threads.set(path, t);
      continue;
    }
    // The first timeline body is always the PR/issue description, even when it is
    // empty ("No description provided") or written by a bot (e.g. a dependabot PR).
    if (description === null) {
      description = md;
      author = who;
      continue;
    }
    if (!md) continue;
    if (opts.skipBots && isBot(who, link?.getAttribute('href') ?? '')) {
      skippedBots++;
      continue;
    }
    comments.push({ author: who, date, body: md, kind: 'comment' });
  }

  const labels = [
    ...new Set(
      Array.from(document.querySelectorAll('[data-testid="issue-labels"] a, .js-issue-labels a, a.IssueLabel'))
        .map((a) => a.textContent?.trim() ?? '')
        .filter(Boolean),
    ),
  ];
  // Header markup varies: classic (.base-ref/.commit-ref) vs the newer React header,
  // which renders [base, head] as prc-BranchName elements (duplicated by a sticky header).
  const branchNames = [
    ...new Set(
      Array.from(document.querySelectorAll('[class*="prc-BranchName-BranchName"], [data-component="BranchName"]'))
        .map((e) => e.textContent?.trim() ?? '')
        .filter(Boolean),
    ),
  ];
  const baseRef = text('.base-ref') || branchNames[0] || '';
  const headRef =
    text('.head-ref') ||
    Array.from(document.querySelectorAll('.commit-ref'))
      .map((e) => e.textContent?.trim() ?? '')
      .find((t) => t && t !== baseRef) ||
    branchNames.find((t) => t !== baseRef) ||
    '';
  const isPR = ref.segment === 'pull' || /Pull Request #/.test(document.title);
  const type = ref.segment === 'discussions' ? 'discussion' : isPR ? 'pull_request' : 'issue';

  if (skippedBots) warnings.push(`Skipped ${skippedBots} bot comment(s). Toggle in Settings.`);
  if (bodies.length === 0) warnings.push('No comment bodies found on the page. Is it fully loaded?');
  warnings.push(
    'Read from the page itself: collapsed "Load more" items and unopened review threads are not included.' +
      (type === 'pull_request' ? ' Open the Conversation tab for comments.' : ''),
  );

  return {
    type,
    url,
    repo: `${ref.owner}/${ref.repo}`,
    number: ref.number,
    title,
    author: author || fallback.author,
    state: (text('[data-testid="header-state"]') || text('[data-component="StateLabel"]') || text('.State')).toLowerCase() || undefined,
    labels,
    base: isPR ? baseRef || undefined : undefined,
    head: isPR ? headRef || undefined : undefined,
    description: description ?? '',
    comments,
    threads: [...threads.values()],
  };
}

// ───────────────────────────── rendering ─────────────────────────────

function renderComment(c: Comment, index: number): string {
  return block(
    'comment',
    { index, author: c.author, date: c.date, type: c.kind === 'review' ? 'review' : undefined, review_state: c.reviewState },
    c.body || '_(no text)_',
  );
}

export function render(d: GitHubData): string {
  const parts: string[] = [];
  parts.push(`<title>${d.title}</title>`);
  if (d.author) parts.push(`<author>${d.author}</author>`);
  if (d.base || d.head) parts.push(`<branches${attrs({ base: d.base, head: d.head })} />`);
  if (d.labels.length) parts.push(`<labels>${d.labels.join(', ')}</labels>`);
  parts.push(block('description', {}, d.description || '_(no description)_'));

  if (d.comments.length) {
    parts.push(`<comments count="${d.comments.length}">\n${d.comments.map((c, i) => renderComment(c, i + 1)).join('\n')}\n</comments>`);
  }
  if (d.threads.length) {
    const threads = d.threads.map((t) => {
      const inner = [
        t.hunk ? fence('diff', t.hunk) : '',
        ...t.comments.map((c, i) => renderComment(c, i + 1)),
      ].filter(Boolean).join('\n');
      return `<thread${attrs({ path: t.path, line: t.line ?? undefined })}>\n${inner}\n</thread>`;
    });
    parts.push(`<review_threads count="${d.threads.length}">\n${threads.join('\n')}\n</review_threads>`);
  }
  if (d.diff) {
    parts.push(block('diff', { note: d.diff.note }, d.diff.text ? fence('diff', d.diff.text) : '_(empty)_'));
  }
  return `<github_context${attrs({ type: d.type, repo: d.repo, number: d.number, state: d.state, url: d.url })}>\n${parts.join('\n')}\n</github_context>`;
}

// ───────────────────────────── entry ─────────────────────────────

export async function extractGitHub(ref: GitHubRef, opts: ExtractOptions, url: string): Promise<ExtractResult> {
  const warnings: string[] = [];
  let data: GitHubData;
  let source: 'api' | 'dom' = 'api';

  if (ref.segment === 'discussions') {
    // Discussions are GraphQL-only in GitHub's API; read the page.
    source = 'dom';
    data = fromDom(ref, opts, url, warnings);
  } else {
    try {
      data = await fromApi(ref, opts, warnings);
    } catch (e) {
      source = 'dom';
      const reason = e instanceof ApiError ? e.message : 'GitHub API unreachable.';
      warnings.push(`${reason} Used the page content instead${opts.githubToken ? '' : ' (add a GitHub token in Settings for complete PR context)'}.`);
      data = fromDom(ref, opts, url, warnings);
      // github.com/…/pull/N.diff redirects cross-origin (patch-diff.githubusercontent.com),
      // which CORS blocks without a broad host permission, so the diff needs the API.
      if (data.type === 'pull_request' && opts.includeDiff) {
        warnings.push('Diff not included: it needs the GitHub API (add a token in Settings for private repos).');
      }
    }
  }

  return {
    ok: true,
    kind: data.type === 'pull_request' ? 'github-pr' : 'github-issue',
    title: data.title,
    url: data.url,
    source,
    payload: render(data),
    warnings,
  };
}
