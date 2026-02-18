<script>
  import { onDestroy } from "svelte";

  export let text;
  export let delayMs = 300;
  export let disabled = false;
  export let placement = "bottom";
  export let wrapperClass = "";
  export let tooltipClass = "";
  export let groupAriaLabel;

  let isVisible = false;
  let hoverTimer;

  $: normalizedText = typeof text === "string" && text.trim() ? text.trim() : undefined;
  $: normalizedDelayMs = Number.isFinite(delayMs) && delayMs >= 0 ? Math.floor(delayMs) : 0;
  $: placementClass = readPlacementClass(placement);
  $: if (disabled || !normalizedText) {
    hideTooltip();
  }

  onDestroy(() => {
    clearHoverTimer();
  });

  function clearHoverTimer() {
    if (typeof hoverTimer !== "undefined") {
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
    }
  }

  function hideTooltip() {
    clearHoverTimer();
    isVisible = false;
  }

  function scheduleTooltip() {
    if (disabled || !normalizedText) {
      return;
    }
    clearHoverTimer();
    if (normalizedDelayMs === 0) {
      isVisible = true;
      return;
    }
    hoverTimer = setTimeout(() => {
      isVisible = true;
      hoverTimer = undefined;
    }, normalizedDelayMs);
  }

  function handleMouseEnter() {
    scheduleTooltip();
  }

  function handleMouseLeave() {
    hideTooltip();
  }

  function handleFocusIn() {
    if (disabled || !normalizedText) {
      return;
    }
    clearHoverTimer();
    isVisible = true;
  }

  function handleFocusOut(event) {
    const nextFocusedElement = event.relatedTarget;
    if (event.currentTarget?.contains?.(nextFocusedElement)) {
      return;
    }
    hideTooltip();
  }

  function readPlacementClass(candidatePlacement) {
    switch (candidatePlacement) {
      case "top":
        return "left-1/2 bottom-full mb-1.5 -translate-x-1/2";
      case "right":
        return "left-full top-1/2 ml-2 -translate-y-1/2";
      case "left":
        return "right-full top-1/2 mr-2 -translate-y-1/2";
      default:
        return "left-1/2 top-full mt-1.5 -translate-x-1/2";
    }
  }
</script>

<div
  {...$$restProps}
  class="relative {wrapperClass}"
  role="group"
  aria-label={groupAriaLabel}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
>
  <slot />
  {#if isVisible && normalizedText}
    <div
      role="tooltip"
      class="pointer-events-none absolute z-20 w-max max-w-64 whitespace-normal rounded-md border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-2 py-1 text-[11px] leading-4 text-vsc-input-fg shadow-lg {placementClass} {tooltipClass}"
    >
      {normalizedText}
    </div>
  {/if}
</div>
