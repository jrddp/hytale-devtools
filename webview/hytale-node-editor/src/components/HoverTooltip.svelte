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

  $: tooltipHeadingText = typeof headingText === "string" ? headingText : undefined;
  $: tooltipText = typeof text === "string" ? stripOfficialDocumentationLink(text) : undefined;
  $: tooltipItalicText = typeof italicText === "string" ? italicText : undefined;
  $: tooltipDelayMs = Number(delayMs) || 0;
  $: placementStyle = readPlacementStyle(placement);
  $: if (disabled || !hasTooltipContent()) {
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

  function readPlacementStyle(candidatePlacement) {
    switch (candidatePlacement) {
      case "top-start":
        return "left: 0; bottom: calc(100% + 6px);";
      case "top":
        return "left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%);";
      case "right":
        return "left: calc(100% + 8px); top: 50%; transform: translateY(-50%);";
      case "left":
        return "right: calc(100% + 8px); top: 50%; transform: translateY(-50%);";
      default:
        return "left: 50%; top: calc(100% + 6px); transform: translateX(-50%);";
    }
  }

  function isErrorLine(line) {
    return line.startsWith("Error:");
  }

  function isWarningLine(line) {
    return line.startsWith("Warning:");
  }

  function stripOfficialDocumentationLink(value) {
    return value
      .replace(
        /\n*\*?\[Official Documentation\]\([^)]+\)\*?/gi,
        "",
      )
      .trim();
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
  {#if isVisible && hasTooltipContent()}
    <div
      role="tooltip"
      style={placementStyle}
      class="pointer-events-none absolute z-20 w-max max-w-80 whitespace-pre-line rounded-md border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-2 py-1 text-[11px] leading-4 text-vsc-input-fg shadow-lg {tooltipClass}"
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
