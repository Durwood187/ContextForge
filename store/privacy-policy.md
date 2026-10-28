# ContextForge Privacy Policy

_Last updated: October 26, 2026_

ContextForge is a browser extension that converts the page you are viewing into Markdown and copies it to your clipboard. It has no servers, no accounts, no analytics, and no tracking.

## What the extension reads
- **The current tab's content, only when you ask.** ContextForge uses Chrome's `activeTab` permission, so it can read a page only after you click its toolbar button or press its keyboard shortcut, and only that tab. The content is processed inside your browser and placed on your clipboard.

## What leaves your browser
- **GitHub API requests.** When the current page is a GitHub pull request, issue, or discussion, ContextForge requests that item's public data (title, comments, reviews, diff) from `api.github.com`, the same service you are already viewing. If you add a GitHub token in Settings, it is sent only to `api.github.com` as the Authorization header.
- **Nothing else.** ContextForge does not send page content, browsing history, or any other data to the developer or to any third party.

## What is stored
Your settings (toggles, optional prompt text, optional GitHub token) are saved in `chrome.storage.local` on your device. Uninstalling the extension deletes them.

## Data sale and use
ContextForge does not sell, share, or transfer user data, does not use it for any purpose other than the extension's single function, and does not use it to determine creditworthiness or for lending.

## Contact
Questions: durwood.extensions@gmail.com
