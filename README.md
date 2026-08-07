# saidomeio

A small browser extension that gets common overlays, consent prompts, and popups out of the way.

It watches for known close/dismiss controls after a page loads and also lets `Escape` click visible close-style controls when a site does not handle the key itself.

## Install locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this folder.

## Notes

The extension runs on all URLs so it can work beyond one specific news site. Browser pages, extension stores, and other protected pages may still block content scripts.
