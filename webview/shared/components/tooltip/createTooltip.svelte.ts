export type CreateTooltipOptions = {
  interactive?: boolean;
};

export type TooltipController = ReturnType<typeof createTooltip>;

export function createTooltip({ interactive = false }: CreateTooltipOptions = {}) {
  let referenceElement: HTMLElement | null = null;

  let isOpen = $state(false);
  let isPointerOverTrigger = false;
  let isPointerOverContent = false;

  function open() {
    isOpen = true;
  }

  function forceClose() {
    isPointerOverTrigger = false;
    isPointerOverContent = false;
    isOpen = false;
  }

  function close() {
    if (interactive && (isPointerOverTrigger || isPointerOverContent)) {
      return;
    }

    isOpen = false;
  }

  function handleTriggerPointerEnter() {
    isPointerOverTrigger = true;
    open();
  }

  function handleTriggerPointerLeave() {
    isPointerOverTrigger = false;
    close();
  }

  function handleContentPointerEnter() {
    isPointerOverContent = true;
    open();
  }

  function handleContentPointerLeave() {
    isPointerOverContent = false;
    close();
  }

  function handleTriggerFocus() {
    open();
  }

  function handleTriggerBlur() {
    close();
  }

  $effect(() => {
    if (!isOpen || typeof window === "undefined") return;

    function handleScroll() {
      forceClose();
    }

    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  });

  const trigger = 
    (node: HTMLElement) => {
      referenceElement = node;

      node.addEventListener("mouseenter", handleTriggerPointerEnter);
      node.addEventListener("mouseleave", handleTriggerPointerLeave);
      node.addEventListener("focus", handleTriggerFocus);
      node.addEventListener("blur", handleTriggerBlur);

      return () => {
        if (referenceElement === node) {
          referenceElement = null;
        }

        node.removeEventListener("mouseenter", handleTriggerPointerEnter);
        node.removeEventListener("mouseleave", handleTriggerPointerLeave);
        node.removeEventListener("focus", handleTriggerFocus);
        node.removeEventListener("blur", handleTriggerBlur);
      };
    };

  return {
    trigger,
    interactive,
    isOpen: () => isOpen,
    getReferenceElement: () => referenceElement,
    handleContentPointerEnter,
    handleContentPointerLeave,
    open,
    close,
  };
}
