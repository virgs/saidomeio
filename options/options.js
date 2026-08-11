const STORAGE_KEY = "saidomeioConfig";

const fields = {
  enabled: document.querySelector("#enabled"),
  scanIntervalMs: document.querySelector("#scanIntervalMs"),
  scanDurationMs: document.querySelector("#scanDurationMs"),
  sitesList: document.querySelector("#sitesList"),
  newSite: document.querySelector("#newSite"),
  autoCloseSelectors: document.querySelector("#autoCloseSelectors"),
  escapeCloseSelectors: document.querySelector("#escapeCloseSelectors"),
  autoCloseText: document.querySelector("#autoCloseText"),
  escapeCloseText: document.querySelector("#escapeCloseText"),
  currentSite: document.querySelector("#currentSite"),
};

const status = document.querySelector("#status");
const form = document.querySelector("#config-form");
const resetButton = document.querySelector("#reset");
const restoreSitesButton = document.querySelector("#restoreSites");
const addSiteButton = document.querySelector("#addSite");
const toggleCurrentSiteButton = document.querySelector("#toggleCurrentSite");

let defaultConfig = null;
let currentHostname = "";
let sites = [];

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

function configuredSites(storedConfig) {
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

function mergeConfig(storedConfig) {
  const arrayOrDefault = (value, defaultValue) => Array.isArray(value) ? value : defaultValue;

  return {
    ...defaultConfig,
    ...storedConfig,
    sites: configuredSites(storedConfig),
    autoCloseSelectors: arrayOrDefault(storedConfig.autoCloseSelectors, defaultConfig.autoCloseSelectors),
    escapeCloseSelectors: arrayOrDefault(storedConfig.escapeCloseSelectors, defaultConfig.escapeCloseSelectors),
    autoCloseText: arrayOrDefault(storedConfig.autoCloseText, defaultConfig.autoCloseText),
    escapeCloseText: arrayOrDefault(storedConfig.escapeCloseText, defaultConfig.escapeCloseText),
  };
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

function normalizeSite(value) {
  const trimmed = String(value || "").trim().toLowerCase();

  if (trimmed.startsWith("*.")) {
    return `*.${normalizeHost(trimmed.slice(2))}`;
  }

  return normalizeHost(trimmed);
}

function sitePatternMatches(pattern, hostname) {
  const normalizedPattern = normalizeSite(pattern);

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

function uniqueSites(values) {
  return [...new Set((values || []).map(normalizeSite).filter(Boolean))];
}

function hasCurrentSite() {
  return sites.some((site) => sitePatternMatches(site, currentHostname));
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

function toLines(values) {
  return (values || []).join("\n");
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

function updateCurrentSiteButton() {
  const hasSite = Boolean(currentHostname);

  fields.currentSite.textContent = hasSite ? currentHostname : "Unavailable";
  toggleCurrentSiteButton.disabled = !hasSite;
  toggleCurrentSiteButton.textContent = hasCurrentSite() ? "Remove current site" : "Add current site";
}

function renderSites() {
  fields.sitesList.textContent = "";

  sites.forEach((site, index) => {
    const row = document.createElement("div");
    row.className = "site-row";

    const value = document.createElement("span");
    value.className = "site-value";
    value.textContent = site;

    const actions = document.createElement("div");
    actions.className = "site-actions";

    const edit = document.createElement("button");
    edit.className = "icon";
    edit.type = "button";
    edit.title = "Edit site";
    edit.setAttribute("aria-label", `Edit ${site}`);
    edit.textContent = "✎";
    edit.addEventListener("click", () => editSite(index));

    const remove = document.createElement("button");
    remove.className = "icon";
    remove.type = "button";
    remove.title = "Remove site";
    remove.setAttribute("aria-label", `Remove ${site}`);
    remove.textContent = "X";
    remove.addEventListener("click", () => removeSite(index));

    actions.append(edit, remove);
    row.append(value, actions);
    fields.sitesList.append(row);
  });

  updateCurrentSiteButton();
}

function commitSites(nextSites) {
  sites = uniqueSites(nextSites);
  renderSites();
}

function addSite(value) {
  const site = normalizeSite(value);

  if (!site) {
    showStatus("Enter a site first");
    return;
  }

  commitSites([...sites, site]);
  fields.newSite.value = "";
}

function removeSite(index) {
  commitSites(sites.filter((_, siteIndex) => siteIndex !== index));
}

function editSite(index) {
  const row = fields.sitesList.children[index];
  const original = sites[index];
  row.textContent = "";

  const input = document.createElement("input");
  input.type = "text";
  input.value = original;

  const actions = document.createElement("div");
  actions.className = "site-actions";

  const save = document.createElement("button");
  save.className = "icon";
  save.type = "button";
  save.title = "Save site";
  save.setAttribute("aria-label", `Save ${original}`);
  save.textContent = "✓";
  save.addEventListener("click", () => {
    const nextSite = normalizeSite(input.value);
    if (!nextSite) {
      showStatus("Enter a site first");
      return;
    }
    commitSites(sites.map((site, siteIndex) => siteIndex === index ? nextSite : site));
  });

  const cancel = document.createElement("button");
  cancel.className = "icon";
  cancel.type = "button";
  cancel.title = "Cancel edit";
  cancel.setAttribute("aria-label", `Cancel editing ${original}`);
  cancel.textContent = "X";
  cancel.addEventListener("click", renderSites);

  actions.append(save, cancel);
  row.append(input, actions);
  input.focus();
  input.select();
}

function render(config) {
  fields.enabled.checked = config.enabled;
  fields.scanIntervalMs.value = config.scanIntervalMs;
  fields.scanDurationMs.value = config.scanDurationMs;
  sites = uniqueSites(config.sites);
  fields.autoCloseSelectors.value = toLines(config.autoCloseSelectors);
  fields.escapeCloseSelectors.value = toLines(config.escapeCloseSelectors);
  fields.autoCloseText.value = toLines(config.autoCloseText);
  fields.escapeCloseText.value = toLines(config.escapeCloseText);
  renderSites();
}

function readFormConfig() {
  return {
    enabled: fields.enabled.checked,
    scanIntervalMs: Number(fields.scanIntervalMs.value),
    scanDurationMs: Number(fields.scanDurationMs.value),
    sites,
    autoCloseSelectors: fromLines(fields.autoCloseSelectors.value),
    escapeCloseSelectors: fromLines(fields.escapeCloseSelectors.value),
    autoCloseText: fromLines(fields.autoCloseText.value),
    escapeCloseText: fromLines(fields.escapeCloseText.value),
  };
}

function validateConfig(config) {
  const arrayFields = [
    "sites",
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
  currentHostname = await getActiveTabHostname();
  const storedConfig = await getStoredConfig();
  render(mergeConfig(storedConfig));
}

restoreSitesButton.addEventListener("click", () => {
  commitSites(defaultConfig.sites);
  showStatus("Sites restored");
});

addSiteButton.addEventListener("click", () => {
  addSite(fields.newSite.value);
});

fields.newSite.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addSite(fields.newSite.value);
  }
});

toggleCurrentSiteButton.addEventListener("click", () => {
  if (hasCurrentSite()) {
    commitSites(sites.filter((site) => !sitePatternMatches(site, currentHostname)));
  } else {
    commitSites([...sites, currentHostname]);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const config = readFormConfig();
    validateConfig(config);
    config.sites = uniqueSites(config.sites);
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
