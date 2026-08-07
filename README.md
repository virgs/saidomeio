<p align="center">
  <img src="icons/icon-source.png" alt="saidomeio logo" width="128">
</p>

<h1 align="center">saidomeio</h1>

<p align="center">
  A small browser extension that gets overlays, consent prompts, notification pre-prompts, and popups out of the way.
</p>

<p align="center">
  <strong>Configurable</strong> · <strong>Site-aware</strong> · <strong>Escape-friendly</strong>
</p>

## What it does

`saidomeio` watches the page for common close, dismiss, reject, and "not now" controls. It can click high-confidence matches automatically and can also use `Escape` as a manual fallback for similar visible controls.

It is useful for prompts like:

- notification pre-prompts such as "Agora nao", "Not now", and "No thanks"
- consent or privacy dialogs with close/reject controls
- newsletter and modal overlays with accessible close labels
- dynamically inserted overlays that appear after the page loads

## Features

- Runs on all URLs by default.
- Optional allow list to run only on selected sites.
- Optional block list to disable selected sites.
- Configurable scan interval and scan duration.
- Configurable CSS selectors for automatic dismissal.
- Configurable text matches for automatic dismissal.
- Configurable CSS selectors and text matches for `Escape`.
- Browser UI for normal edits.
- JSON override editor for advanced edits.
- Default config checked into the repo.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repo folder.
5. Pin `saidomeio` if you want quick access to the popup config.

## Configuration

Defaults live in [config.default.json](config.default.json).

User overrides are saved with `chrome.storage.sync` from the extension popup or Options page. The options UI exposes the same core fields as the JSON config.

### Site Lists

`allowSites` controls where the extension is allowed to run.

- Empty allow list: run on all sites.
- Non-empty allow list: run only on matching sites.

`blockSites` always wins over `allowSites`.

Examples:

```text
g1.globo.com
*.globo.com
dailyhive.com
omelete.com.br
```

### Timing

```json
{
  "scanIntervalMs": 250,
  "scanDurationMs": 15000
}
```

The extension scans frequently for a short period after page load and resumes scanning when the DOM changes.

### Selectors And Text

Selectors handle known popup libraries and accessible close controls. Text matches handle buttons such as:

```text
agora nao
nao obrigado
no thanks
not now
maybe later
dispensar
```

Text is normalized before matching, so accents and case are not significant.

## Project Layout

```text
saidomeio/
  config.default.json      Default extension behavior
  content.js               Page-level dismissal logic
  manifest.json            Chrome extension manifest
  options/                 Popup and Options UI
  icons/                   Extension icons and transparent source
  docs/icon-prompt.md      Approved icon generation prompt
```

## Privacy

`saidomeio` does not send browsing data anywhere. Configuration is stored by the browser using `chrome.storage.sync`.

Because the extension can run on all URLs, browsers may show broad site-access warnings. Use `allowSites` and `blockSites` if you prefer a narrower scope.

## Name

`saidomeio` comes from "sai do meio": get out of the way.
