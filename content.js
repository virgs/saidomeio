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

function mergeConfig(defaultConfig, storedConfig) {
  const arrayOrDefault = (value, defaultValue) => Array.isArray(value) ? value : defaultValue;
  const migratedSiteConfig = migrateSiteConfig(storedConfig, defaultConfig);

  return {
    ...defaultConfig,
    ...storedConfig,
    defaultSiteAction: migratedSiteConfig.defaultSiteAction,
    siteRules: migratedSiteConfig.siteRules,
    autoCloseSelectors: arrayOrDefault(storedConfig.autoCloseSelectors, defaultConfig.autoCloseSelectors),
    escapeCloseSelectors: arrayOrDefault(storedConfig.escapeCloseSelectors, defaultConfig.escapeCloseSelectors),
    autoCloseText: arrayOrDefault(storedConfig.autoCloseText, defaultConfig.autoCloseText),
    escapeCloseText: arrayOrDefault(storedConfig.escapeCloseText, defaultConfig.escapeCloseText),
  };
}

function migrateSiteConfig(storedConfig, defaultConfig) {
  if (Array.isArray(storedConfig.siteRules)) {
    return {
      defaultSiteAction: ["run", "skip"].includes(storedConfig.defaultSiteAction)
        ? storedConfig.defaultSiteAction
        : defaultConfig.defaultSiteAction,
      siteRules: storedConfig.siteRules,
    };
  }

  const allowSites = Array.isArray(storedConfig.allowSites) ? storedConfig.allowSites : [];
  const blockSites = Array.isArray(storedConfig.blockSites) ? storedConfig.blockSites : [];

  return {
    defaultSiteAction: allowSites.length > 0 ? "skip" : defaultConfig.defaultSiteAction,
    siteRules: [
      ...allowSites.map((site) => ({ site, action: "run" })),
      ...blockSites.map((site) => ({ site, action: "skip" })),
    ],
  };
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
  let siteAction = currentConfig.defaultSiteAction === "skip" ? "skip" : "run";

  (currentConfig.siteRules || []).forEach((rule) => {
    if (rule && sitePatternMatches(rule.site, hostname) && ["run", "skip"].includes(rule.action)) {
      siteAction = rule.action;
    }
  });

  return siteAction === "run";
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
  element.click();
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
