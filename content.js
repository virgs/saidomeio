const AUTO_CLOSE_SELECTORS = [
  ".fc-close.fc-icon-button",
  ".fc-close",
  ".fc-dialog-container .fc-button[aria-label*='close' i]",
  ".fc-dialog-container [aria-label*='close' i]",
  ".fc-consent-root [aria-label*='close' i]",
  "#onetrust-close-btn-container button",
  "#onetrust-reject-all-handler",
  ".onetrust-close-btn-handler",
  ".osano-cm-close",
  ".qc-cmp2-close-icon",
  ".qc-cmp2-summary-buttons button[mode='secondary']",
  ".didomi-popup-notice__close",
  ".didomi-components-button[aria-label*='disagree' i]",
  "[data-testid='close-button']",
  "[data-testid='modal-close']",
  "[data-test='modal-close']",
  "[data-cy='modal-close']",
  "[aria-label='Close']",
  "[aria-label='close']",
  "[aria-label='Dismiss']",
  "[aria-label='dismiss']",
  "[aria-label='No thanks']",
  "[aria-label='Not now']",
  "button[title='Close']",
  "button[title='close']",
  "button[title='Dismiss']",
  "button[title='No thanks']",
  "button[title='Not now']",
];

const ESCAPE_CLOSE_SELECTORS = [
  ...AUTO_CLOSE_SELECTORS,
  "button",
  "[role='button']",
  "a[href]",
];

const CLOSE_TEXT = [
  "close",
  "dismiss",
  "no thanks",
  "not now",
  "maybe later",
  "skip",
  "fechar",
  "dispensar",
  "agora nao",
  "talvez mais tarde",
  "recusar",
  "reject",
  "decline",
];

const scanIntervalMs = 250;
const scanDurationMs = 15000;
const clicked = new WeakSet();
let scanIntervalId = null;
let observer = null;
let scanStart = Date.now();

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

function normalizeText(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
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

function matchesCloseText(element) {
  const text = getElementText(element);
  return CLOSE_TEXT.some((closeText) => text.includes(closeText));
}

function queryAllInRoot(root, selectors) {
  const elements = [];

  selectors.forEach((selector) => {
    try {
      elements.push(...root.querySelectorAll(selector));
    } catch (error) {
      console.debug("Popup Dismiss Helper skipped selector:", selector, error);
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
  console.debug("Popup Dismiss Helper clicked:", reason, element);
  return true;
}

function autoClose() {
  const candidates = queryAllInRoot(document, AUTO_CLOSE_SELECTORS);

  for (const element of candidates) {
    if (clickElement(element, "auto selector")) {
      return true;
    }
  }

  return false;
}

function closeOnEscape() {
  const candidates = queryAllInRoot(document, ESCAPE_CLOSE_SELECTORS)
    .filter((element) => isVisible(element) && matchesCloseText(element));

  for (const element of candidates) {
    if (clickElement(element, "Escape")) {
      return true;
    }
  }

  return false;
}

function stopScanningIfDone() {
  if (Date.now() - scanStart < scanDurationMs) {
    return;
  }

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

scan();
scanIntervalId = window.setInterval(scan, scanIntervalMs);

observer = new MutationObserver(() => {
  scanStart = Date.now();
  scan();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      closeOnEscape();
    }
  },
  true,
);
