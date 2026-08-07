const STORAGE_KEY = "saidomeioConfig";

const fields = {
  enabled: document.querySelector("#enabled"),
  scanIntervalMs: document.querySelector("#scanIntervalMs"),
  scanDurationMs: document.querySelector("#scanDurationMs"),
  defaultSiteAction: document.querySelector("#defaultSiteAction"),
  siteRules: document.querySelector("#siteRules"),
  autoCloseSelectors: document.querySelector("#autoCloseSelectors"),
  escapeCloseSelectors: document.querySelector("#escapeCloseSelectors"),
  autoCloseText: document.querySelector("#autoCloseText"),
  escapeCloseText: document.querySelector("#escapeCloseText"),
  jsonConfig: document.querySelector("#jsonConfig"),
  defaultSiteRules: document.querySelector("#defaultSiteRules"),
  currentSite: document.querySelector("#currentSite"),
  currentSiteRule: document.querySelector("#currentSiteRule"),
};

const status = document.querySelector("#status");
const form = document.querySelector("#config-form");
const resetButton = document.querySelector("#reset");
const restoreSiteRulesButton = document.querySelector("#restoreSiteRules");
const runCurrentSiteButton = document.querySelector("#runCurrentSite");
const skipCurrentSiteButton = document.querySelector("#skipCurrentSite");
const defaultCurrentSiteButton = document.querySelector("#defaultCurrentSite");

let defaultConfig = null;
let currentHostname = "";
let jsonChangedManually = false;

function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (items) => {
      resolve(items[STORAGE_KEY] || {});
    });
  });
}

function setStoredConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: config }, resolve);
  });
}

function clearStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.remove(STORAGE_KEY, resolve);
  });
}

async function loadDefaultConfig() {
  const response = await fetch(chrome.runtime.getURL("config.default.json"));
  return response.json();
}

function migrateSiteConfig(storedConfig) {
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

function mergeConfig(storedConfig) {
  const arrayOrDefault = (value, defaultValue) => Array.isArray(value) ? value : defaultValue;
  const migratedSiteConfig = migrateSiteConfig(storedConfig);

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

function toLines(values) {
  return (values || []).join("\n");
}

function fromLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function rulesToLines(rules) {
  return (rules || [])
    .map((rule) => `${rule.action} ${rule.site}`)
    .join("\n");
}

function rulesFromLines(value) {
  return fromLines(value).map((line) => {
    const [action, ...siteParts] = line.split(/\s+/);
    const site = siteParts.join(" ");
    return { action, site };
  });
}

function describeRules(rules) {
  return rules.length > 0 ? rulesToLines(rules).replace(/\n/g, ", ") : "no site-specific rules";
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

function getActiveTabHostname() {
  return new Promise((resolve) => {
    if (!chrome.tabs) {
      resolve("");
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (chrome.runtime.lastError || !tab?.url) {
        resolve("");
        return;
      }

      try {
        const url = new URL(tab.url);
        resolve(["http:", "https:"].includes(url.protocol) ? url.hostname.toLowerCase() : "");
      } catch {
        resolve("");
      }
    });
  });
}

function matchingRuleForHost(rules, hostname) {
  return rules.findLast((rule) => normalizeHost(rule.site) === hostname);
}

function withoutHostRule(rules, hostname) {
  return rules.filter((rule) => normalizeHost(rule.site) !== hostname);
}

function setHostRule(action) {
  const rules = withoutHostRule(rulesFromLines(fields.siteRules.value), currentHostname);
  rules.push({ site: currentHostname, action });
  fields.siteRules.value = rulesToLines(rules);
  jsonChangedManually = false;
  updateJsonFromForm();
  updateCurrentSiteControls();
}

function useDefaultForHost() {
  fields.siteRules.value = rulesToLines(withoutHostRule(rulesFromLines(fields.siteRules.value), currentHostname));
  jsonChangedManually = false;
  updateJsonFromForm();
  updateCurrentSiteControls();
}

function updateJsonFromForm() {
  if (!jsonChangedManually) {
    const formConfig = readFormConfig();
    fields.jsonConfig.value = JSON.stringify(formConfig, null, 2);
  }
}

function updateCurrentSiteControls() {
  const rules = rulesFromLines(fields.siteRules.value);
  const rule = matchingRuleForHost(rules, currentHostname);
  const hasCurrentSite = Boolean(currentHostname);
  const defaultAction = fields.defaultSiteAction.value;
  const effectiveAction = rule?.action || defaultAction;

  fields.currentSite.textContent = hasCurrentSite ? currentHostname : "Unavailable";
  runCurrentSiteButton.disabled = !hasCurrentSite || rule?.action === "run";
  skipCurrentSiteButton.disabled = !hasCurrentSite || rule?.action === "skip";
  defaultCurrentSiteButton.disabled = !hasCurrentSite || !rule;

  if (!hasCurrentSite) {
    fields.currentSiteRule.textContent = "Open this popup on an http or https page to manage the current site.";
    return;
  }

  fields.currentSiteRule.textContent = rule
    ? `Current site has a rule: ${rule.action}.`
    : `Current site follows the default: ${effectiveAction}.`;
}

function showStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 2400);
}

function render(config) {
  fields.enabled.checked = config.enabled;
  fields.scanIntervalMs.value = config.scanIntervalMs;
  fields.scanDurationMs.value = config.scanDurationMs;
  fields.defaultSiteAction.value = config.defaultSiteAction;
  fields.siteRules.value = rulesToLines(config.siteRules);
  fields.autoCloseSelectors.value = toLines(config.autoCloseSelectors);
  fields.escapeCloseSelectors.value = toLines(config.escapeCloseSelectors);
  fields.autoCloseText.value = toLines(config.autoCloseText);
  fields.escapeCloseText.value = toLines(config.escapeCloseText);
  fields.defaultSiteRules.textContent = describeRules(defaultConfig.siteRules);
  fields.jsonConfig.value = JSON.stringify(config, null, 2);
  jsonChangedManually = false;
  updateCurrentSiteControls();
}

function readFormConfig() {
  return {
    enabled: fields.enabled.checked,
    scanIntervalMs: Number(fields.scanIntervalMs.value),
    scanDurationMs: Number(fields.scanDurationMs.value),
    defaultSiteAction: fields.defaultSiteAction.value,
    siteRules: rulesFromLines(fields.siteRules.value),
    autoCloseSelectors: fromLines(fields.autoCloseSelectors.value),
    escapeCloseSelectors: fromLines(fields.escapeCloseSelectors.value),
    autoCloseText: fromLines(fields.autoCloseText.value),
    escapeCloseText: fromLines(fields.escapeCloseText.value),
  };
}

function validateConfig(config) {
  const arrayFields = [
    "siteRules",
    "autoCloseSelectors",
    "escapeCloseSelectors",
    "autoCloseText",
    "escapeCloseText",
  ];

  if (typeof config.enabled !== "boolean") {
    throw new Error("Enabled must be true or false.");
  }

  if (!["run", "skip"].includes(config.defaultSiteAction)) {
    throw new Error("Default site behavior must be run or skip.");
  }

  if (!Number.isFinite(config.scanIntervalMs) || config.scanIntervalMs < 50) {
    throw new Error("Scan interval must be at least 50 ms.");
  }

  if (!Number.isFinite(config.scanDurationMs) || config.scanDurationMs < 1000) {
    throw new Error("Scan duration must be at least 1000 ms.");
  }

  arrayFields.forEach((field) => {
    if (!Array.isArray(config[field])) {
      throw new Error(`${field} must be an array.`);
    }
  });

  config.siteRules.forEach((rule) => {
    if (!rule || !["run", "skip"].includes(rule.action) || typeof rule.site !== "string" || !rule.site.trim()) {
      throw new Error("Site rules must use: run example.com or skip example.com.");
    }
  });

  [
    "autoCloseSelectors",
    "escapeCloseSelectors",
    "autoCloseText",
    "escapeCloseText",
  ].forEach((field) => {
    if (!config[field].every((item) => typeof item === "string")) {
      throw new Error(`${field} must be an array of strings.`);
    }
  });
}

async function init() {
  defaultConfig = await loadDefaultConfig();
  currentHostname = await getActiveTabHostname();
  const storedConfig = await getStoredConfig();
  render(mergeConfig(storedConfig));
}

[
  fields.enabled,
  fields.scanIntervalMs,
  fields.scanDurationMs,
  fields.defaultSiteAction,
  fields.siteRules,
  fields.autoCloseSelectors,
  fields.escapeCloseSelectors,
  fields.autoCloseText,
  fields.escapeCloseText,
].forEach((field) => {
  field.addEventListener("input", () => {
    updateJsonFromForm();
    updateCurrentSiteControls();
  });
});

fields.jsonConfig.addEventListener("input", () => {
  jsonChangedManually = true;
});

restoreSiteRulesButton.addEventListener("click", () => {
  fields.siteRules.value = rulesToLines(defaultConfig.siteRules);
  jsonChangedManually = false;
  fields.siteRules.dispatchEvent(new Event("input", { bubbles: true }));
  showStatus("Site rules restored");
});

runCurrentSiteButton.addEventListener("click", () => {
  setHostRule("run");
});

skipCurrentSiteButton.addEventListener("click", () => {
  setHostRule("skip");
});

defaultCurrentSiteButton.addEventListener("click", () => {
  useDefaultForHost();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const config = jsonChangedManually
      ? JSON.parse(fields.jsonConfig.value)
      : readFormConfig();

    validateConfig(config);
    await setStoredConfig(config);
    render(mergeConfig(config));
    showStatus("Saved");
  } catch (error) {
    showStatus(error.message);
  }
});

resetButton.addEventListener("click", async () => {
  await clearStoredConfig();
  render(defaultConfig);
  showStatus("Reset");
});

init();
