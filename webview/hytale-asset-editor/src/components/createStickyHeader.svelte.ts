export type CreateStickyHeaderOptions = {
  enabled?: () => boolean;
  top?: () => number;
};

const PANEL_SELECTOR = "[data-field-panel]";
const SCROLL_ROOT_SELECTOR = "[data-sticky-scroll-root]";

export function createStickyHeader({
  enabled = () => true,
  top = () => 0,
}: CreateStickyHeaderOptions = {}) {
  let headerElement: HTMLElement | null = null;
  let panelElement: HTMLElement | null = null;
  let scrollRootElement: HTMLElement | null = null;

  let isStuck = $state(false);
  let hasPassedStickyThreshold = $state(false);

  function update() {
    if (!enabled() || !headerElement || !panelElement || !scrollRootElement) {
      isStuck = false;
      hasPassedStickyThreshold = false;
      return;
    }

    const rootTop = scrollRootElement.getBoundingClientRect().top;
    const panelRect = panelElement.getBoundingClientRect();
    const stickyTop = rootTop + top();

    hasPassedStickyThreshold = panelRect.top < stickyTop;
    isStuck =
      hasPassedStickyThreshold &&
      panelRect.bottom > stickyTop + headerElement.offsetHeight;
  }

  $effect(() => {
    void enabled();
    void top();

    queueMicrotask(update);
  });

  const header = (node: HTMLElement) => {
    headerElement = node;
    panelElement = node.closest(PANEL_SELECTOR);
    scrollRootElement = node.closest(SCROLL_ROOT_SELECTOR);
    const currentPanelElement = panelElement;
    const currentScrollRootElement = scrollRootElement;

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => update());

    resizeObserver?.observe(node);
    if (currentPanelElement) {
      resizeObserver?.observe(currentPanelElement);
    }

    const handleScroll = () => update();

    currentScrollRootElement?.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    queueMicrotask(update);

    return () => {
      if (headerElement === node) {
        headerElement = null;
        panelElement = null;
        scrollRootElement = null;
      }

      resizeObserver?.disconnect();
      currentScrollRootElement?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      isStuck = false;
      hasPassedStickyThreshold = false;
    };
  };

  return {
    header,
    hasPassedStickyThreshold: () => hasPassedStickyThreshold,
    isStuck: () => isStuck,
    update,
  };
}
