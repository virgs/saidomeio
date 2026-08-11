globalThis.SaidomeioBadge = ((shared) => {
  const fallbackSessionRemovalCounts = new Map();
  let badgeHost = null;
  let badgeCount = null;
  let badgeHideTimeout = null;

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

  function showRemovalBadge(count, config) {
    ensureRemovalBadge();
    const badgeSize = shared.numberOrDefault(config.badgeSizePx, 34);

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
    }, shared.numberOrDefault(config.badgeDurationMs, 2000));
  }

  function recordPopupRemoval(hostname, config) {
    chrome.runtime.sendMessage(
      { type: "saidomeio:record-dismissal", hostname },
      (response) => {
        const fallbackCount = (fallbackSessionRemovalCounts.get(hostname) || 0) + 1;
        const nextCount = Number.isFinite(response?.count) ? response.count : fallbackCount;

        fallbackSessionRemovalCounts.set(hostname, nextCount);
        showRemovalBadge(nextCount, config);
      },
    );
  }

  return {
    recordPopupRemoval,
  };
})(SaidomeioShared);
