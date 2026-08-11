globalThis.SaidomeioDom = ((shared) => {
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

    return shared.normalizeText(values.filter(Boolean).join(" "));
  }

  function matchesText(element, textList) {
    const text = getElementText(element);
    return textList.some((closeText) => text.includes(shared.normalizeText(closeText)));
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

  return {
    getElementText,
    isVisible,
    matchesText,
    queryAllInRoot,
  };
})(SaidomeioShared);
