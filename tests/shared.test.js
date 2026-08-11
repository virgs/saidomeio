const assert = require("node:assert/strict");
const test = require("node:test");

const shared = require("../content/shared.js");

class FakeElement {
  constructor({
    attributes = {},
    className = "",
    id = "",
    parentElement = null,
    rect = { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 },
    style = { position: "static", zIndex: "auto" },
  } = {}) {
    this.attributes = attributes;
    this.className = className;
    this.id = id;
    this.parentElement = parentElement;
    this.rect = rect;
    this.style = style;
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  getRootNode() {
    return {};
  }
}

global.Element = FakeElement;

const viewport = {
  document: {
    documentElement: {
      clientWidth: 1000,
      clientHeight: 800,
    },
  },
  getComputedStyle(element) {
    return element.style;
  },
  innerWidth: 1000,
  innerHeight: 800,
};

test("normalizeText trims, lowercases, removes accents, and collapses spaces", () => {
  assert.equal(shared.normalizeText("  NÃO   Obrigado  "), "nao obrigado");
});

test("sitePatternMatches handles exact, suffix, and wildcard matches", () => {
  assert.equal(shared.sitePatternMatches("dailyhive.com", "dailyhive.com"), true);
  assert.equal(shared.sitePatternMatches("dailyhive.com", "www.dailyhive.com"), true);
  assert.equal(shared.sitePatternMatches("*.globo.com", "g1.globo.com"), true);
  assert.equal(shared.sitePatternMatches("*.globo.com", "globo.com"), true);
  assert.equal(shared.sitePatternMatches("dailyhive.com", "example.com"), false);
});

test("mergeConfig keeps legacy site-rule fallback support", () => {
  const defaultConfig = {
    badgeDurationMs: 2000,
    badgeSizePx: 48,
    scanDurationMs: 15000,
    scanIntervalMs: 250,
    sites: ["default.test"],
    autoCloseSelectors: [".default-auto"],
    escapeCloseSelectors: ["button"],
    autoCloseText: ["no thanks"],
    escapeCloseText: ["close"],
  };
  const storedConfig = {
    scanIntervalMs: Number.NaN,
    siteRules: [
      { action: "skip", site: "ignored.test" },
      { action: "run", site: "dailyhive.com" },
    ],
  };

  assert.deepEqual(shared.mergeConfig(defaultConfig, storedConfig), {
    ...defaultConfig,
    ...storedConfig,
    scanIntervalMs: 250,
    sites: ["dailyhive.com"],
  });
});

test("looksLikeOverlay identifies large fixed overlays", () => {
  const overlay = new FakeElement({
    rect: { width: 700, height: 500, left: 150, right: 850, top: 100, bottom: 600 },
    style: { position: "fixed", zIndex: "1000" },
  });
  const ordinaryFixedElement = new FakeElement({
    rect: { width: 120, height: 40, left: 0, right: 120, top: 0, bottom: 40 },
    style: { position: "fixed", zIndex: "1000" },
  });

  assert.equal(shared.looksLikeOverlay(overlay, viewport), true);
  assert.equal(shared.looksLikeOverlay(ordinaryFixedElement, viewport), false);
});

test("isInPopupContext accepts dialog ancestors and rejects ordinary page controls", () => {
  const dialog = new FakeElement({ attributes: { role: "dialog" } });
  const dialogButton = new FakeElement({ parentElement: dialog });
  const pageButton = new FakeElement();

  assert.equal(shared.isInPopupContext(dialogButton, viewport), true);
  assert.equal(shared.isInPopupContext(pageButton, viewport), false);
});

test("isInPopupContext accepts overlay-like ancestors", () => {
  const overlay = new FakeElement({
    rect: { width: 700, height: 500, left: 150, right: 850, top: 100, bottom: 600 },
    style: { position: "fixed", zIndex: "1000" },
  });
  const closeButton = new FakeElement({ parentElement: overlay });

  assert.equal(shared.isInPopupContext(closeButton, viewport), true);
});
