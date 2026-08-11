globalThis.SaidomeioShared = (() => {
  const POPUP_SIGNALS = [
    "adblock",
    "ad block",
    "admiral",
    "cmp",
    "consent",
    "cookie",
    "dialog",
    "didomi",
    "fc dialog",
    "interstitial",
    "lightbox",
    "modal",
    "newsletter",
    "notice",
    "onetrust",
    "overlay",
    "paywall",
    "popup",
    "popover",
    "privacy",
    "subscribe",
  ];

  function numberOrDefault(value, defaultValue) {
    return Number.isFinite(value) ? value : defaultValue;
  }

  function arrayOrDefault(value, defaultValue) {
    return Array.isArray(value) ? value : defaultValue;
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

  function mergeConfig(defaultConfig, storedConfig) {
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

  function shouldRunOnSite(currentConfig, hostname) {
    if (!currentConfig.enabled) {
      return false;
    }

    return (currentConfig.sites || [])
      .some((site) => sitePatternMatches(site, hostname.toLowerCase()));
  }

  function getParentElement(element) {
    if (element.parentElement) {
      return element.parentElement;
    }

    const root = element.getRootNode();
    return typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot ? root.host : null;
  }

  function getElementSignals(element) {
    const values = [
      element.id,
      element.className,
      element.getAttribute("role"),
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-test"),
      element.getAttribute("data-cy"),
    ];

    return normalizeText(values.filter(Boolean).join(" "));
  }

  function hasPopupSignal(element) {
    if (["dialog", "alertdialog"].includes(element.getAttribute("role"))) {
      return true;
    }

    if (element.getAttribute("aria-modal") === "true") {
      return true;
    }

    const signals = getElementSignals(element);
    return POPUP_SIGNALS.some((signal) => signals.includes(signal));
  }

  function looksLikeOverlay(element, viewport = globalThis) {
    const style = viewport.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const zIndex = Number.parseInt(style.zIndex, 10);
    const viewportWidth = viewport.innerWidth || viewport.document.documentElement.clientWidth;
    const viewportHeight = viewport.innerHeight || viewport.document.documentElement.clientHeight;

    if (!["fixed", "sticky"].includes(style.position) || !Number.isFinite(zIndex) || zIndex < 10) {
      return false;
    }

    const coversMuchOfViewport =
      rect.width >= viewportWidth * 0.35 &&
      rect.height >= viewportHeight * 0.18;
    const centeredEnough =
      rect.left < viewportWidth * 0.35 &&
      rect.right > viewportWidth * 0.65 &&
      rect.top < viewportHeight * 0.65 &&
      rect.bottom > viewportHeight * 0.20;

    return coversMuchOfViewport && centeredEnough;
  }

  function isInPopupContext(element, viewport = globalThis) {
    let current = element;

    while (current && current instanceof Element) {
      if (hasPopupSignal(current) || looksLikeOverlay(current, viewport)) {
        return true;
      }

      current = getParentElement(current);
    }

    return false;
  }

  return {
    getConfiguredSites,
    isInPopupContext,
    looksLikeOverlay,
    mergeConfig,
    normalizeText,
    numberOrDefault,
    shouldRunOnSite,
    sitePatternMatches,
  };
})();

if (typeof module !== "undefined") {
  module.exports = globalThis.SaidomeioShared;
}
