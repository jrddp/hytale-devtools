<script>
  import { Handle, Position } from "@xyflow/svelte";
  import HoverTooltip from "../components/HoverTooltip.svelte";

  export let id;
  export let type = "target";
  export let side = "left";
  export let top = "0px";
  export let width = 12;
  export let label = "";
  export let showTooltip = false;

  $: normalizedSide = side === "right" ? "right" : "left";
  $: normalizedPosition = normalizedSide === "right" ? Position.Right : Position.Left;
  $: normalizedType = type === "source" ? "source" : "target";
  $: normalizedTop = readTopValue(top);
  $: normalizedWidth = readPinWidth(width);
  $: normalizedLabel = typeof label === "string" ? label.trim() : "";
  $: pinSideClass = normalizedSide === "right" ? "right-0 rounded-l-full" : "left-0 rounded-r-full";
  $: tooltipPlacement = normalizedSide === "right" ? "right" : "left";
  $: tooltipAriaLabel = normalizedLabel
    ? `${normalizedSide === "right" ? "Output" : "Input"} pin ${normalizedLabel}`
    : undefined;

  function readTopValue(candidate) {
    if (Number.isFinite(candidate)) {
      return `${candidate}px`;
    }

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    return "0px";
  }

  function readPinWidth(candidate) {
    if (Number.isFinite(candidate) && Number(candidate) > 0) {
      return `${Number(candidate)}px`;
    }

    if (typeof candidate === "string" && candidate.trim()) {
      const trimmedCandidate = candidate.trim();
      const numericWidth = Number(trimmedCandidate);

      if (Number.isFinite(numericWidth) && numericWidth > 0) {
        return `${numericWidth}px`;
      }

      return trimmedCandidate;
    }

    return "12px";
  }
</script>

<Handle
  type={normalizedType}
  position={normalizedPosition}
  {id}
  style={`top: ${normalizedTop}; height: var(--pin-diameter); --pin-width: ${normalizedWidth}; --pin-diameter: calc(var(--pin-width) * 2);`}
  class="w-px! min-w-0! min-h-0! bg-transparent! border-none! overflow-visible! [transform:translate(0,-50%)]"
>
  {#if showTooltip && normalizedLabel}
    <HoverTooltip
      text={normalizedLabel}
      placement={tooltipPlacement}
      wrapperClass="block [width:var(--pin-width)] [height:var(--pin-diameter)]"
      groupAriaLabel={tooltipAriaLabel}
    >
      <span
        aria-hidden="true"
        class={`absolute top-1/2 -translate-y-1/2 bg-vsc-focus ${pinSideClass}`}
        style="width: var(--pin-width); height: var(--pin-diameter);"
      ></span>
    </HoverTooltip>
  {:else}
    <span
      aria-hidden="true"
      class={`absolute top-1/2 -translate-y-1/2 bg-vsc-focus ${pinSideClass}`}
      style="width: var(--pin-width); height: var(--pin-diameter);"
    ></span>
  {/if}
</Handle>
