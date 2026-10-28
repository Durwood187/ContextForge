# Manual test pass (about 20 minutes)

Load `dist/` unpacked (chrome://extensions → Developer mode → Load unpacked). After any rebuild, click ↻ on the extension card **and reload the tabs you're testing**.

For each row: click the icon, check the preview, click Copy, and paste into Claude, Cursor, or a text editor.

| # | Page | Expect |
|---|------|--------|
| 1 | Public PR with reviews, e.g. github.com/vitejs/vite/pull/19000 | Label says `GitHub PR · API`; reviews with review_state; `<review_threads>`; `<diff>` without pnpm-lock.yaml |
| 2 | Public issue, e.g. github.com/vitejs/vite/issues/18100 | Label says `GitHub Issue · API`; 2 comments; state shown as closed (not_planned) |
| 3 | A PR on its **Files changed** tab | Same full output as row 1 (the API doesn't depend on which tab is open) |
| 4 | A **private** repo PR, no token set | Label says `· page`; warning about the private repo; comments present; diff missing, with a warning |
| 5 | Same private PR **with** a fine-grained token (read-only Issues + Pull requests + Contents) | Label switches to `· API`; diff present |
| 6 | Wrong token (type garbage) | Warning that the token was rejected; falls back to the page |
| 7 | A GitHub Discussion | Page-based output with the posts |
| 8 | docusaurus.io/docs/markdown-features/code-blocks | Fences tagged `jsx`, `md`, …; no sidebar or table of contents; no "Edit this page" |
| 9 | mintlify.com/docs/quickstart | Title present once; code fences tagged `shellscript` |
| 10 | nextra.site/docs | Clean text; fences (no language: Nextra doesn't expose one) |
| 11 | A blog post or news article | "generic article detection" warning; readable body |
| 12 | Highlight a paragraph, then clip | Kind = Selection, only that text |
| 13 | chrome://extensions or the Web Store | Friendly "Chrome does not let extensions read this page" |
| 14 | Keyboard: Alt+Shift+C on row 1 | Orange toast "Context copied (~N tokens)"; clipboard filled |
| 15 | Settings → prompt wrapper on, with text | Preview starts with your text |
| 16 | Light mode (macOS appearance) | Popup is readable |
| 17 | 15+ PR clips in an hour without a token | Rate-limit warning, then page fallback (expected) |

Debugging: right-click the popup → Inspect (popup errors); chrome://extensions → "service worker" link (shortcut errors); the page's DevTools console shows `[ContextForge]` errors from extraction.
