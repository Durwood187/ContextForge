# ContextForge

Chrome extension (Manifest V3) that turns the page you're on (a GitHub PR, issue, or discussion, a docs page, or any article) into clean, structured Markdown ready to paste into Claude, Cursor, or ChatGPT.

## Quick start

```bash
npm install
npm run build        # → dist/
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick `dist/`.
2. Pin the icon. Open any GitHub PR and click the icon, or press **⌥⇧C** (Alt+Shift+C). If Chrome didn't assign the shortcut because of a conflict, set one at `chrome://extensions/shortcuts`.

`npm run dev` rebuilds on save. After a rebuild, click the reload arrow on the extension card. `npm run zip` builds `contextforge.zip` for the Web Store.

## What it produces

**GitHub PR or issue** (from the REST API when it can reach it, otherwise from the page):

```xml
<github_context type="pull_request" repo="vitejs/vite" number="19000" state="merged" url="…">
<title>fix(resolve): handle package.json with UTF-8 BOM</title>
<author>SeraphimKaito</author>
<branches base="main" head="SeraphimKaito:fix/issues-18911" />
<labels>p2-edge-case</labels>
<description>…markdown…</description>
<comments count="3">
<comment index="1" author="sapphi-red" date="2024-12-18" type="review" review_state="CHANGES_REQUESTED">…</comment>
</comments>
<review_threads count="1">
<thread path="packages/vite/src/node/packages.ts" line="182">
```diff …last 8 lines of the hunk… ```
<comment index="1" author="sapphi-red">This function already exists at …</comment>
</thread>
</review_threads>
<diff note="omitted generated/lock files: pnpm-lock.yaml">```diff …```</diff>
</github_context>
```

**Docs or article:** `<document url="…" title="…"># Title …markdown…</document>`. Code fences keep their language (Prism, Shiki, GitHub, Mintlify, and MDN conventions). Navigation, tables of contents, edit links, pagination, hidden tabs, and heading-anchor glyphs are stripped.

**Selection:** if you've highlighted text, only the selection is clipped.

## Layout

```
static/                 manifest.json, popup.html/.css, icons (copied as-is to dist/)
src/background.ts       keyboard shortcut → extract → copy in page → toast
src/popup/popup.ts      popup UI and settings
src/inject/extractor.ts injected on demand; registers window.__contextforge.extract()
src/inject/github.ts    GitHub: REST API path + DOM fallback + XML rendering
src/inject/docs.ts      docs/article detection, visibility pruning, Readability fallback
src/inject/markdown.ts  Turndown setup, code-block normalisation, URL absolutising
src/shared/*            types, settings, clip runner, formatting helpers
scripts/build.mjs       esbuild: 3 bundles + static copy
```

## Design decisions (where this differs from the original Gemini spec)

- **esbuild instead of Vite/CRXJS, and plain CSS instead of Tailwind.** The injected script must be a single self-contained file with no shared chunks. esbuild does that with three entry points and no plugin. The popup is about 150 lines of CSS, so Tailwind would add a build step without paying for itself.
- **GitHub API first, DOM second.** GitHub's DOM is mid-migration (issues use a React UI with `data-testid` hooks, PRs still use the classic timeline) and lazy-loads review threads. The REST API returns raw Markdown, complete reviews, inline review threads, and the diff. The DOM path is the fallback for private repos when no token is set.
- **The PR diff and inline review comments are included.** For a PR they are usually the most useful context, and the original spec left them out. Lockfiles and build output are dropped from the diff, and the diff is capped (60k chars by default).
- **Bot comments (CI, dependabot, Vercel previews) are skipped by default.** HTML comments from PR templates are stripped too.
- **No host permissions at all.** Only `activeTab`, `scripting`, `storage`, and `clipboardWrite`. Calls to `api.github.com` need no permission because GitHub sends `Access-Control-Allow-Origin: *`.
- **Free, with no licensing.** The Lemon Squeezy tier was removed for v1, which leaves fewer moving parts and a simpler privacy story for review.
- **Default shortcut is Alt+Shift+C, not Cmd+Shift+C.** Cmd+Shift+C is Chrome's DevTools "inspect element" shortcut on macOS.

## Shipping

See `TESTING.md` for the manual test pass and `store/` for the listing copy, privacy policy, and store images.

## Known limitations

- Without a token, GitHub's public API allows 60 requests per hour (roughly 10 PR clips, since each PR uses about 6 requests). Private repos without a token fall back to the page DOM, which has no diff and no unopened review threads.
- GitHub Discussions always use the DOM path, because discussions are only available through the GraphQL API.
- Token counts are an estimate (characters ÷ 4).
- Pages that render content in canvas or cross-origin iframes (some Notion and Google Docs views) can't be read.
