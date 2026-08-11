const SESSION_COUNTS_STORAGE_KEY = "saidomeioSessionDismissalCounts";

function getSessionCounts() {
  return new Promise((resolve) => {
    chrome.storage.session.get(SESSION_COUNTS_STORAGE_KEY, (items) => {
      resolve(items[SESSION_COUNTS_STORAGE_KEY] || {});
    });
  });
}

function setSessionCounts(counts) {
  return new Promise((resolve) => {
    chrome.storage.session.set({ [SESSION_COUNTS_STORAGE_KEY]: counts }, resolve);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "saidomeio:record-dismissal" || typeof message.hostname !== "string") {
    return false;
  }

  getSessionCounts()
    .then(async (counts) => {
      const currentCount = counts[message.hostname];
      const nextCount = (Number.isFinite(currentCount) ? currentCount : 0) + 1;

      counts[message.hostname] = nextCount;
      await setSessionCounts(counts);
      sendResponse({ count: nextCount });
    })
    .catch((error) => {
      console.debug("saidomeio session count update failed:", error);
      sendResponse({ count: null });
    });

  return true;
});
