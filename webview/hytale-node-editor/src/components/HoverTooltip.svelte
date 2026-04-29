<script lang="ts">
  import { onDestroy } from "svelte";

  export let headingText = undefined;
  export let text;
  export let italicText = undefined;
  export let delayMs = 300;
  export let disabled = false;
  export let placement = "bottom";
  export let wrapperClass = "";
  export let tooltipClass = "";
  export let groupAriaLabel = undefined;

  let isVisible = false;
  let hoverTimer;
  let referenceElement;
  let tooltipElement;
  let attachedTooltipElement;

  $: tooltipHeadingText = typeof headingText === "string" ? headingText : undefined;
  $: tooltipText = typeof text === "string" ? text : undefined;
  $: tooltipItalicText = typeof italicText === "string" ? italicText : undefined;
  $: tooltipDelayMs = Number(delayMs) || 0;
  $: tooltipStyle = readTooltipStyle();
  $: if (disabled || !hasTooltipContent()) {
    hideTooltip();
  }
  $: syncTooltipPortal();

  onDestroy(() => {
    clearHoverTimer();
    detachTooltipElement();
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
    if (disabled || !hasTooltipContent()) {
      return;
    }
    clearHoverTimer();
    if (tooltipDelayMs === 0) {
      isVisible = true;
      return;
    }
    hoverTimer = setTimeout(() => {
      isVisible = true;
      hoverTimer = undefined;
    }, tooltipDelayMs);
  }

  function handleMouseEnter() {
    scheduleTooltip();
  }

  function handleMouseLeave() {
    hideTooltip();
  }

  function handleFocusIn() {
    if (disabled || !hasTooltipContent()) {
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

  function hasTooltipContent() {
    return Boolean(tooltipHeadingText || tooltipText || tooltipItalicText);
  }

  function detachTooltipElement() {
    attachedTooltipElement?.remove();
    attachedTooltipElement = undefined;
  }

  function syncTooltipPortal() {
    if (!tooltipElement) {
      detachTooltipElement();
      return;
    }
    if (attachedTooltipElement === tooltipElement) {
      return;
    }

    detachTooltipElement();
    attachedTooltipElement = tooltipElement;
    document.body.appendChild(tooltipElement);
  }

  function readTooltipStyle() {
    if (!referenceElement) {
      return "";
    }

    const bounds = referenceElement.getBoundingClientRect();
    switch (placement) {
      case "top-start":
        return `left: ${bounds.left}px; top: ${bounds.top}px; transform: translateY(calc(-100% - 6px));`;
      case "top":
        return `left: ${bounds.left + bounds.width / 2}px; top: ${bounds.top}px; transform: translate(-50%, calc(-100% - 6px));`;
      case "right":
        return `left: ${bounds.right}px; top: ${bounds.top + bounds.height / 2}px; transform: translate(8px, -50%);`;
      case "left":
        return `left: ${bounds.left}px; top: ${bounds.top + bounds.height / 2}px; transform: translate(calc(-100% - 8px), -50%);`;
      default:
        return `left: ${bounds.left + bounds.width / 2}px; top: ${bounds.bottom}px; transform: translate(-50%, 6px);`;
    }
  }

  function isErrorLine(line) {
    return line.startsWith("Error:");
  }

  function isWarningLine(line) {
    return line.startsWith("Warning:");
  }
</script>

<div
  {...$$restProps}
  bind:this={referenceElement}
  class="relative {wrapperClass}"
  role="group"
  aria-label={groupAriaLabel}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
>
  <slot />
  {#if isVisible && hasTooltipContent()}
    <div
      bind:this={tooltipElement}
      role="tooltip"
      style={tooltipStyle}
      class="pointer-events-none fixed z-[3002] w-max max-w-80 whitespace-pre-line rounded-md border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-2 py-1 text-[11px] leading-4 text-vsc-input-fg shadow-lg {tooltipClass}"
    >
      {#if tooltipHeadingText}
        <strong>{tooltipHeadingText}</strong>
      {/if}
      {#if tooltipText}
        {#if tooltipHeadingText}<br />{/if}
        {#each tooltipText.split("\n") as line, index (index)}
          {#if index > 0}<br />{/if}
          {#if isErrorLine(line)}
            <strong>Error:</strong>{line.slice("Error:".length)}
          {:else if isWarningLine(line)}
            <strong>Warning:</strong>{line.slice("Warning:".length)}
          {:else}
            {line}
          {/if}
        {/each}
      {/if}
      {#if tooltipItalicText}
        {#if tooltipHeadingText || tooltipText}<br /><br />{/if}
        <em>{tooltipItalicText}</em>
      {/if}
    </div>
  {/if}
</div>
