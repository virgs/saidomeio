const STORAGE_KEY = "saidomeioConfig";

const fields = {
  enabled: document.querySelector("#enabled"),
  scanIntervalMs: document.querySelector("#scanIntervalMs"),
  scanDurationMs: document.querySelector("#scanDurationMs"),
  allowSites: document.querySelector("#allowSites"),
  blockSites: document.querySelector("#blockSites"),
  autoCloseSelectors: document.querySelector("#autoCloseSelectors"),
  escapeCloseSelectors: document.querySelector("#escapeCloseSelectors"),
  autoCloseText: document.querySelector("#autoCloseText"),
  escapeCloseText: document.querySelector("#escapeCloseText"),
  jsonConfig: document.querySelector("#jsonConfig"),
  defaultAllowSites: document.querySelector("#defaultAllowSites"),
  defaultBlockSites: document.querySelector("#defaultBlockSites"),
};

const status = document.querySelector("#status");
const form = document.querySelector("#config-form");
const resetButton = document.querySelector("#reset");
const restoreAllowSitesButton = document.querySelector("#restoreAllowSites");
const restoreBlockSitesButton = document.querySelector("#restoreBlockSites");

let defaultConfig = null;
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

function mergeConfig(storedConfig) {
  const arrayOrDefault = (value, defaultValue) => Array.isArray(value) ? value : defaultValue;

  return {
    ...defaultConfig,
    ...storedConfig,
    autoCloseSelectors: arrayOrDefault(storedConfig.autoCloseSelectors, defaultConfig.autoCloseSelectors),
    escapeCloseSelectors: arrayOrDefault(storedConfig.escapeCloseSelectors, defaultConfig.escapeCloseSelectors),
    autoCloseText: arrayOrDefault(storedConfig.autoCloseText, defaultConfig.autoCloseText),
    escapeCloseText: arrayOrDefault(storedConfig.escapeCloseText, defaultConfig.escapeCloseText),
    allowSites: arrayOrDefault(storedConfig.allowSites, defaultConfig.allowSites),
    blockSites: arrayOrDefault(storedConfig.blockSites, defaultConfig.blockSites),
  };
}

function toLines(values) {
  return (values || []).join("\n");
}

function describeSiteList(values, emptyLabel) {
  return values.length > 0 ? values.join(", ") : emptyLabel;
}

function fromLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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
  fields.allowSites.value = toLines(config.allowSites);
  fields.blockSites.value = toLines(config.blockSites);
  fields.autoCloseSelectors.value = toLines(config.autoCloseSelectors);
  fields.escapeCloseSelectors.value = toLines(config.escapeCloseSelectors);
  fields.autoCloseText.value = toLines(config.autoCloseText);
  fields.escapeCloseText.value = toLines(config.escapeCloseText);
  fields.defaultAllowSites.textContent = describeSiteList(defaultConfig.allowSites, "all sites");
  fields.defaultBlockSites.textContent = describeSiteList(defaultConfig.blockSites, "none");
  fields.jsonConfig.value = JSON.stringify(config, null, 2);
  jsonChangedManually = false;
}

function readFormConfig() {
  return {
    enabled: fields.enabled.checked,
    scanIntervalMs: Number(fields.scanIntervalMs.value),
    scanDurationMs: Number(fields.scanDurationMs.value),
    allowSites: fromLines(fields.allowSites.value),
    blockSites: fromLines(fields.blockSites.value),
    autoCloseSelectors: fromLines(fields.autoCloseSelectors.value),
    escapeCloseSelectors: fromLines(fields.escapeCloseSelectors.value),
    autoCloseText: fromLines(fields.autoCloseText.value),
    escapeCloseText: fromLines(fields.escapeCloseText.value),
  };
}

function validateConfig(config) {
  const arrayFields = [
    "allowSites",
    "blockSites",
    "autoCloseSelectors",
    "escapeCloseSelectors",
    "autoCloseText",
    "escapeCloseText",
  ];

  if (typeof config.enabled !== "boolean") {
    throw new Error("Enabled must be true or false.");
  }

  if (!Number.isFinite(config.scanIntervalMs) || config.scanIntervalMs < 50) {
    throw new Error("Scan interval must be at least 50 ms.");
  }

  if (!Number.isFinite(config.scanDurationMs) || config.scanDurationMs < 1000) {
    throw new Error("Scan duration must be at least 1000 ms.");
  }

  arrayFields.forEach((field) => {
    if (!Array.isArray(config[field]) || !config[field].every((item) => typeof item === "string")) {
      throw new Error(`${field} must be an array of strings.`);
    }
  });
}

async function init() {
  defaultConfig = await loadDefaultConfig();
  const storedConfig = await getStoredConfig();
  render(mergeConfig(storedConfig));
}

[
  fields.enabled,
  fields.scanIntervalMs,
  fields.scanDurationMs,
  fields.allowSites,
  fields.blockSites,
  fields.autoCloseSelectors,
  fields.escapeCloseSelectors,
  fields.autoCloseText,
  fields.escapeCloseText,
].forEach((field) => {
  field.addEventListener("input", () => {
    if (!jsonChangedManually) {
      const formConfig = readFormConfig();
      fields.jsonConfig.value = JSON.stringify(formConfig, null, 2);
    }
  });
});

fields.jsonConfig.addEventListener("input", () => {
  jsonChangedManually = true;
});

restoreAllowSitesButton.addEventListener("click", () => {
  fields.allowSites.value = toLines(defaultConfig.allowSites);
  fields.allowSites.dispatchEvent(new Event("input", { bubbles: true }));
  showStatus("Allow list restored");
});

restoreBlockSitesButton.addEventListener("click", () => {
  fields.blockSites.value = toLines(defaultConfig.blockSites);
  fields.blockSites.dispatchEvent(new Event("input", { bubbles: true }));
  showStatus("Block list restored");
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
