# Chrome Web Store listing: copy and paste into the dashboard

## Store listing tab

**Name** (from manifest): ContextForge — GitHub & Docs to LLM Context

**Summary** (from manifest, max 132 chars): Turn the GitHub PR, issue, or docs page you're on into clean, structured Markdown for Claude, Cursor, or ChatGPT.

**Category:** Developer Tools  **Language:** English

**Description:**

Stop pasting messy page dumps into your AI assistant. ContextForge turns the page you are reading into clean, structured context in one click.

GITHUB PULL REQUESTS & ISSUES
• Title, author, branches, labels, and description
• Every comment and review in order, including approve and request-changes states
• Inline review threads with the diff hunk each comment refers to
• The PR diff, with lockfiles and build output removed and a size cap you control
• Bot and CI comments skipped (optional)
• Output wrapped in XML tags that Claude, Cursor, and ChatGPT parse reliably

DOCUMENTATION & ARTICLES
• Tuned for Docusaurus, Mintlify, and Nextra, with generic article detection for everything else
• Code blocks keep their language (```tsx, ```bash…)
• Navigation, sidebars, tables of contents, edit links, and hidden tabs are removed
• Highlight text first to clip only your selection

BUILT FOR SPEED
• Press Alt+Shift+C to clip without opening the popup
• Character count and token estimate before you paste
• Optional prompt that is added in front of every clip

PRIVATE BY DESIGN
• Reads a page only when you click or press the shortcut (activeTab)
• No account, no servers, no analytics
• Optional GitHub token for private repos and higher rate limits, stored only in your browser

Free.

**Screenshots** (1280×800): store/screenshots/s1.png, s2.png, s3.png
**Small promo tile** (440×280): store/screenshots/promo-tile-440x280.png
**Icon:** taken from the package (icons/icon128.png)

## Privacy practices tab

**Single purpose:**
Converts the content of the current web page (GitHub pull requests, issues, discussions, documentation, and articles) into structured Markdown and copies it to the clipboard for use with AI assistants.

**Permission justifications:**
- `activeTab`: Reads the current tab only when the user clicks the toolbar button or presses the keyboard shortcut, so the page can be converted to Markdown. No access to any other tabs or sites.
- `scripting`: Injects the extraction script into the active tab after the user invokes the extension, and shows a small confirmation message on the page after a keyboard-shortcut copy.
- `storage`: Saves the user's settings (diff toggle and size, bot filter, optional prompt text, optional GitHub token) locally.
- `clipboardWrite`: Copies the generated Markdown to the clipboard. This is the extension's core output.

**Remote code:** No, I am not using remote code. (All JavaScript is bundled in the package. Requests to api.github.com fetch data, not code.)

**Data usage:** tick the categories below. Over-disclosing is harmless, but under-disclosing is a common reason for rejection.
- [x] Website content: page text is read locally to build the clip
- [x] Authentication information: the optional GitHub token, stored locally and sent only to api.github.com
- Certify all three statements: not sold to third parties, not used for unrelated purposes, not used for creditworthiness.

**Privacy policy URL:** a public link to store/privacy-policy.md, for example https://github.com/<you>/contextforge/blob/main/store/privacy-policy.md

## Distribution tab
Visibility: start with **Unlisted** (installable by link only) for a week of real use, then switch to **Public**. Regions: all.
