const STORAGE_KEY = "saidomeioConfig";

let config = null;
let clicked = new WeakSet();
let scanIntervalId = null;
let observer = null;
let scanStart = 0;

async function loadDefaultConfig() {
  const response = await fetch(chrome.runtime.getURL("config.default.json"));
  return response.json();
}

function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (items) => {
      resolve(items[STORAGE_KEY] || {});
    });
  });
}

function shouldRunOnCurrentSite(currentConfig) {
  return SaidomeioShared.shouldRunOnSite(currentConfig, window.location.hostname);
}

function getCurrentSiteKey() {
  return window.location.hostname.toLowerCase();
}

function getAutoCloseSelectors() {
  return config.autoCloseSelectors || [];
}

function getEscapeCloseSelectors() {
  return [
    ...new Set([
      ...getAutoCloseSelectors(),
      ...(config.escapeCloseSelectors || []),
    ]),
  ];
}

function clickElement(element, reason) {
  if (!SaidomeioDom.isVisible(element) || clicked.has(element)) {
    return false;
  }

  clicked.add(element);
  try {
    element.click();
  } catch (error) {
    console.debug("saidomeio click failed:", reason, element, error);
    return false;
  }

  SaidomeioBadge.recordPopupRemoval(getCurrentSiteKey(), config);
  console.debug("saidomeio clicked:", reason, element);
  return true;
}

function autoClose() {
  const selectorCandidates = SaidomeioDom.queryAllInRoot(document, getAutoCloseSelectors());

  for (const element of selectorCandidates) {
    if (clickElement(element, "auto selector")) {
      return true;
    }
  }

  const textCandidates = SaidomeioDom.queryAllInRoot(document, getEscapeCloseSelectors())
    .filter((element) => (
      SaidomeioDom.isVisible(element) &&
      SaidomeioDom.matchesText(element, config.autoCloseText || [])
    ));

  for (const element of textCandidates) {
    if (clickElement(element, "auto text")) {
      return true;
    }
  }

  return false;
}

function closeOnEscape() {
  const candidates = SaidomeioDom.queryAllInRoot(document, getEscapeCloseSelectors())
    .filter((element) => (
      SaidomeioDom.isVisible(element) &&
      SaidomeioDom.matchesText(element, config.escapeCloseText || []) &&
      SaidomeioShared.isInPopupContext(element)
    ));

  for (const element of candidates) {
    if (clickElement(element, "Escape")) {
      return true;
    }
  }

  return false;
}

function stopScanningIfDone() {
  if (Date.now() - scanStart < config.scanDurationMs) {
    return;
  }

  stopScanning();
}

function stopScanning() {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }

  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function scan() {
  autoClose();
  stopScanningIfDone();
}

function startScanning() {
  stopScanning();
  clicked = new WeakSet();
  scanStart = Date.now();

  if (!shouldRunOnCurrentSite(config)) {
    return;
  }

  scan();
  scanIntervalId = window.setInterval(scan, config.scanIntervalMs);

  observer = new MutationObserver(() => {
    scanStart = Date.now();
    scan();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

async function reloadConfig() {
  const defaultConfig = await loadDefaultConfig();
  const storedConfig = await getStoredConfig();
  config = SaidomeioShared.mergeConfig(defaultConfig, storedConfig);
  startScanning();
}

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" && config && shouldRunOnCurrentSite(config)) {
      const handled = closeOnEscape();

      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
  },
  true,
);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes[STORAGE_KEY]) {
    reloadConfig();
  }
});

reloadConfig();
