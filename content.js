const STORAGE_KEY = "saidomeioConfig";

let config = null;
let clicked = new WeakSet();
let scanIntervalId = null;
let observer = null;
let scanStart = 0;
const fallbackSessionRemovalCounts = new Map();
let badgeHost = null;
let badgeCount = null;
let badgeHideTimeout = null;

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

function numberOrDefault(value, defaultValue) {
  return Number.isFinite(value) ? value : defaultValue;
}

function mergeConfig(defaultConfig, storedConfig) {
  const arrayOrDefault = (value, defaultValue) => Array.isArray(value) ? value : defaultValue;

  return {
    ...defaultConfig,
    ...storedConfig,
    scanIntervalMs: numberOrDefault(storedConfig.scanIntervalMs, defaultConfig.scanIntervalMs),
    scanDurationMs: numberOrDefault(storedConfig.scanDurationMs, defaultConfig.scanDurationMs),
    badgeSizePx: numberOrDefault(storedConfig.badgeSizePx, defaultConfig.badgeSizePx),
    badgeDurationMs: numberOrDefault(storedConfig.badgeDurationMs, defaultConfig.badgeDurationMs),
    sites: getConfiguredSites(storedConfig, defaultConfig),
    autoCloseSelectors: arrayOrDefault(storedConfig.autoCloseSelectors, defaultConfig.autoCloseSelectors),
    escapeCloseSelectors: arrayOrDefault(storedConfig.escapeCloseSelectors, defaultConfig.escapeCloseSelectors),
    autoCloseText: arrayOrDefault(storedConfig.autoCloseText, defaultConfig.autoCloseText),
    escapeCloseText: arrayOrDefault(storedConfig.escapeCloseText, defaultConfig.escapeCloseText),
  };
}

function getConfiguredSites(storedConfig, defaultConfig) {
  if (Array.isArray(storedConfig.sites)) {
    return storedConfig.sites;
  }

  if (Array.isArray(storedConfig.siteRules)) {
    const runSites = storedConfig.siteRules
      .filter((rule) => rule?.action === "run" && typeof rule.site === "string")
      .map((rule) => rule.site);

    return runSites.length > 0 ? runSites : defaultConfig.sites;
  }

  if (Array.isArray(storedConfig.allowSites) && storedConfig.allowSites.length > 0) {
    return storedConfig.allowSites;
  }

  return defaultConfig.sites;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeHost(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
  }
}

function sitePatternMatches(pattern, hostname) {
  const normalizedPattern = normalizeHost(pattern);

  if (!normalizedPattern) {
    return false;
  }

  if (normalizedPattern === "*" || normalizedPattern === hostname) {
    return true;
  }

  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }

  return hostname === normalizedPattern || hostname.endsWith(`.${normalizedPattern}`);
}

function shouldRunOnCurrentSite(currentConfig) {
  if (!currentConfig.enabled) {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();

  return (currentConfig.sites || []).some((site) => sitePatternMatches(site, hostname));
}

function getCurrentSiteKey() {
  return window.location.hostname.toLowerCase();
}

function ensureRemovalBadge() {
  if (badgeHost?.isConnected && badgeCount) {
    return;
  }

  badgeHost = document.createElement("div");
  badgeHost.setAttribute("aria-hidden", "true");

  const shadow = badgeHost.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 2147483647;
        pointer-events: none;
      }

      .indicator {
        position: relative;
        display: grid;
        place-items: center;
        width: var(--saidomeio-badge-size);
        height: var(--saidomeio-badge-size);
        filter: drop-shadow(0 6px 12px rgb(0 0 0 / 24%));
        opacity: 0;
        transform: translateY(-8px) scale(0.92);
        transition:
          opacity 160ms ease,
          transform 180ms ease;
      }

      :host([data-visible="true"]) .indicator {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .count {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        box-sizing: border-box;
        border: 1px solid #fffdf8;
        border-radius: 999px;
        padding: 0 4px;
        color: #fffdf8;
        background: #151515;
        font: 700 11px/16px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
      }
    </style>
    <div class="indicator">
      <img src="${chrome.runtime.getURL("icons/icon48.png")}" alt="">
      <span class="count"></span>
    </div>
  `;

  badgeCount = shadow.querySelector(".count");
  document.documentElement.append(badgeHost);
}

function showRemovalBadge(count) {
  ensureRemovalBadge();
  const badgeSize = numberOrDefault(config.badgeSizePx, 34);

  badgeHost.style.setProperty("--saidomeio-badge-size", `${badgeSize}px`);
  badgeCount.textContent = count > 99 ? "99+" : String(count);

  window.requestAnimationFrame(() => {
    badgeHost.dataset.visible = "true";
  });

  window.clearTimeout(badgeHideTimeout);
  badgeHideTimeout = window.setTimeout(() => {
    if (badgeHost) {
      badgeHost.dataset.visible = "false";
    }
  }, numberOrDefault(config.badgeDurationMs, 2000));
}

function recordPopupRemoval() {
  const hostname = getCurrentSiteKey();

  chrome.runtime.sendMessage(
    { type: "saidomeio:record-dismissal", hostname },
    (response) => {
      const fallbackCount = (fallbackSessionRemovalCounts.get(hostname) || 0) + 1;
      const nextCount = Number.isFinite(response?.count) ? response.count : fallbackCount;

      fallbackSessionRemovalCounts.set(hostname, nextCount);
      showRemovalBadge(nextCount);
    },
  );
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

function isVisible(element) {
  if (!(element instanceof Element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) !== 0 &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function getElementText(element) {
  const values = [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-test"),
    element.getAttribute("data-cy"),
    element.textContent,
  ];

  return normalizeText(values.filter(Boolean).join(" "));
}

function matchesText(element, textList) {
  const text = getElementText(element);
  return textList.some((closeText) => text.includes(normalizeText(closeText)));
}

function queryAllInRoot(root, selectors) {
  const elements = [];

  selectors.forEach((selector) => {
    try {
      elements.push(...root.querySelectorAll(selector));
    } catch (error) {
      console.debug("saidomeio skipped selector:", selector, error);
    }
  });

  root.querySelectorAll("*").forEach((element) => {
    if (element.shadowRoot) {
      elements.push(...queryAllInRoot(element.shadowRoot, selectors));
    }
  });

  return elements;
}

function clickElement(element, reason) {
  if (!isVisible(element) || clicked.has(element)) {
    return false;
  }

  clicked.add(element);
  try {
    element.click();
  } catch (error) {
    console.debug("saidomeio click failed:", reason, element, error);
    return false;
  }

  recordPopupRemoval();
  console.debug("saidomeio clicked:", reason, element);
  return true;
}

function autoClose() {
  const selectorCandidates = queryAllInRoot(document, getAutoCloseSelectors());

  for (const element of selectorCandidates) {
    if (clickElement(element, "auto selector")) {
      return true;
    }
  }

  const textCandidates = queryAllInRoot(document, getEscapeCloseSelectors())
    .filter((element) => isVisible(element) && matchesText(element, config.autoCloseText || []));

  for (const element of textCandidates) {
    if (clickElement(element, "auto text")) {
      return true;
    }
  }

  return false;
}

function closeOnEscape() {
  const candidates = queryAllInRoot(document, getEscapeCloseSelectors())
    .filter((element) => isVisible(element) && matchesText(element, config.escapeCloseText || []));

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
  config = mergeConfig(defaultConfig, storedConfig);
  startScanning();
}

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" && config && shouldRunOnCurrentSite(config)) {
      closeOnEscape();
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
