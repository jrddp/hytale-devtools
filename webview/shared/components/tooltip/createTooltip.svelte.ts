import type { ReferenceElement, VirtualElement } from "@floating-ui/dom";

export type CreateTooltipOptions = {
  interactive?: boolean;
  followCursor?: boolean;
};

export type TooltipController = ReturnType<typeof createTooltip>;

export function createTooltip({
  interactive = false,
  followCursor = false,
}: CreateTooltipOptions = {}) {
  let referenceElement = $state<HTMLElement | null>(null);
  let pointerX = $state(0);
  let pointerY = $state(0);
  let hasPointerPosition = $state(false);
  let referenceVersion = $state(0);

  let isOpen = $state(false);
  let isPointerOverTrigger = false;
  let isPointerOverContent = false;

  const virtualReference: VirtualElement = {
    getBoundingClientRect() {
      return {
        x: pointerX,
        y: pointerY,
        left: pointerX,
        right: pointerX,
        top: pointerY,
        bottom: pointerY,
        width: 0,
        height: 0,
      };
    },
  };

  function open() {
    isOpen = true;
  }

  function forceClose() {
    isPointerOverTrigger = false;
    isPointerOverContent = false;
    hasPointerPosition = false;
    referenceVersion += 1;
    isOpen = false;
  }

  function close() {
    if (interactive && (isPointerOverTrigger || isPointerOverContent)) {
      return;
    }

    isOpen = false;
  }

  function handleTriggerPointerEnter(event: MouseEvent) {
    isPointerOverTrigger = true;
    if (followCursor) {
      pointerX = event.clientX;
      pointerY = event.clientY;
      hasPointerPosition = true;
      referenceVersion += 1;
    }
    open();
  }

  function handleTriggerPointerLeave() {
    isPointerOverTrigger = false;
    hasPointerPosition = false;
    referenceVersion += 1;
    close();
  }

  function handleTriggerPointerMove(event: MouseEvent) {
    if (!followCursor) {
      return;
    }

    pointerX = event.clientX;
    pointerY = event.clientY;
    hasPointerPosition = true;
    referenceVersion += 1;
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
      node.addEventListener("mousemove", handleTriggerPointerMove);
      node.addEventListener("focus", handleTriggerFocus);
      node.addEventListener("blur", handleTriggerBlur);

      return () => {
        if (referenceElement === node) {
          referenceElement = null;
        }

        node.removeEventListener("mouseenter", handleTriggerPointerEnter);
        node.removeEventListener("mouseleave", handleTriggerPointerLeave);
        node.removeEventListener("mousemove", handleTriggerPointerMove);
        node.removeEventListener("focus", handleTriggerFocus);
        node.removeEventListener("blur", handleTriggerBlur);
      };
    };

  return {
    trigger,
    interactive,
    isOpen: () => isOpen,
    followCursor,
    getReferenceElement: (): ReferenceElement | null =>
      followCursor && hasPointerPosition ? virtualReference : referenceElement,
    getReferenceVersion: () => referenceVersion,
    usesVirtualReference: () => followCursor && hasPointerPosition,
    handleContentPointerEnter,
    handleContentPointerLeave,
    open,
    close,
  };
}
