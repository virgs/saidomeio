const STORAGE_KEY = "saidomeioConfig";

let config = null;
let clicked = new WeakSet();
let guardedVideos = new WeakSet();
let countedVideos = new WeakSet();
let scanIntervalId = null;
let observer = null;
let scanStart = 0;
let mediaIntentUntil = 0;

const MEDIA_INTENT_WINDOW_MS = 3000;
const FLOATING_PLAYER_SELECTORS = [
  ".clappr-player",
  "[data-player]",
  "[data-id-playback]",
  ".id-playback",
];

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

function shouldGuardMedia() {
  return config?.blockAutoplayVideos !== false;
}

function getAutoplayVideoSelectors() {
  return config.autoplayVideoSelectors || [];
}

function hasRecentMediaIntent() {
  return Date.now() < mediaIntentUntil;
}

function getEventPath(event) {
  return typeof event.composedPath === "function" ? event.composedPath() : [];
}

function recordMediaIntent(event) {
  if (!config || !shouldRunOnCurrentSite(config) || !shouldGuardMedia()) {
    return;
  }

  const path = getEventPath(event);
  const hasMediaTarget = path.some((target) => (
    target instanceof Element &&
    target.closest("video, audio, .clappr-player, [data-player], [data-id-playback]")
  ));

  if (hasMediaTarget) {
    mediaIntentUntil = Date.now() + MEDIA_INTENT_WINDOW_MS;
  }
}

function getVideos() {
  return SaidomeioDom.queryAllInRoot(document, getAutoplayVideoSelectors())
    .filter((element) => element instanceof HTMLVideoElement);
}

function preventAutoplay(video) {
  video.autoplay = false;
  video.removeAttribute("autoplay");
  video.setAttribute("preload", "none");

  if (!video.paused && !hasRecentMediaIntent()) {
    video.pause();

    if (!countedVideos.has(video)) {
      countedVideos.add(video);
      SaidomeioBadge.recordPopupRemoval(getCurrentSiteKey(), config);
    }
  }
}

function guardVideo(video) {
  preventAutoplay(video);

  if (guardedVideos.has(video)) {
    return;
  }

  guardedVideos.add(video);

  video.addEventListener(
    "play",
    () => {
      if (!hasRecentMediaIntent()) {
        window.setTimeout(() => preventAutoplay(video), 0);
      }
    },
    true,
  );
}

function guardVideos() {
  if (!shouldGuardMedia()) {
    return false;
  }

  const videos = getVideos();

  videos.forEach(guardVideo);
  return videos.length > 0;
}

function looksLikeFloatingPlayer(element) {
  if (!(element instanceof Element) || !SaidomeioDom.isVisible(element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const isPositioned = ["fixed", "sticky"].includes(style.position);
  const isCornered =
    rect.width <= viewportWidth * 0.55 &&
    rect.height <= viewportHeight * 0.55 &&
    (rect.left <= viewportWidth * 0.12 || rect.right >= viewportWidth * 0.88) &&
    (rect.top <= viewportHeight * 0.20 || rect.bottom >= viewportHeight * 0.80);

  return isPositioned && isCornered;
}

function getFloatingPlayer(video) {
  for (const selector of FLOATING_PLAYER_SELECTORS) {
    const candidate = video.closest(selector);

    if (looksLikeFloatingPlayer(candidate)) {
      return candidate;
    }
  }

  return null;
}

function stopVideosOnEscape() {
  if (!shouldGuardMedia()) {
    return false;
  }

  let handled = false;

  getVideos().forEach((video) => {
    const floatingPlayer = getFloatingPlayer(video);

    if (!video.paused) {
      video.pause();
      handled = true;
    }

    if (floatingPlayer) {
      floatingPlayer.remove();
      handled = true;
    }
  });

  if (handled) {
    SaidomeioBadge.recordPopupRemoval(getCurrentSiteKey(), config);
  }

  return handled;
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
  guardVideos();
  stopScanningIfDone();
}

function startScanning() {
  stopScanning();
  clicked = new WeakSet();
  guardedVideos = new WeakSet();
  countedVideos = new WeakSet();
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
      const handled = closeOnEscape() || stopVideosOnEscape();

      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
  },
  true,
);

window.addEventListener("pointerdown", recordMediaIntent, true);
window.addEventListener("click", recordMediaIntent, true);
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape") {
      recordMediaIntent(event);
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
