<script>
  import { Handle, Position } from "@xyflow/svelte";
  import HoverTooltip from "../components/HoverTooltip.svelte";
  import { getDefaultPinColor, normalizePinColor } from "../node-editor/pinColorUtils.js";

  export let id;
  export let type = "target";
  export let side = "left";
  export let top = "0px";
  export let width = 12;
  export let label = "";
  export let showTooltip = false;
  export let color = undefined;
  export let connectionMultiplicity = "single";

  $: normalizedSide = side === "right" ? "right" : "left";
  $: normalizedPosition = normalizedSide === "right" ? Position.Right : Position.Left;
  $: normalizedType = type === "source" ? "source" : "target";
  $: normalizedTop = readTopValue(top);
  $: normalizedWidth = readPinWidth(width);
  $: normalizedDiameter = readPinDiameter(normalizedWidth);
  $: normalizedLabel = typeof label === "string" ? label.trim() : "";
  $: normalizedColor = normalizePinColor(color) ?? getDefaultPinColor();
  $: normalizedConnectionMultiplicity = readConnectionMultiplicity(connectionMultiplicity);
  $: pinSideClass = normalizedSide === "right" ? "right-0" : "left-0";
  $: pinShapeClass = readPinShapeClass(normalizedConnectionMultiplicity, normalizedSide);
  $: pinClipPath = readPinClipPath(normalizedConnectionMultiplicity, normalizedSide);
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

  function readPinDiameter(pinWidth) {
    return `calc(${pinWidth} * 2)`;
  }

  function readConnectionMultiplicity(candidate) {
    if (candidate === "map") {
      return "map";
    }

    if (candidate === "multiple") {
      return "multiple";
    }

    return "single";
  }

  function readPinShapeClass(multiplicity, pinSide) {
    if (multiplicity === "map" || multiplicity === "multiple") {
      return "rounded-none";
    }

    return pinSide === "right" ? "rounded-l-full" : "rounded-r-full";
  }

  function readPinClipPath(multiplicity, pinSide) {
    if (multiplicity !== "map") {
      return undefined;
    }

    return pinSide === "left"
      ? "polygon(0 0, 100% 50%, 0 100%)"
      : "polygon(100% 0, 0 50%, 100% 100%)";
  }
</script>

<Handle
  type={normalizedType}
  position={normalizedPosition}
  {id}
  style="top: {normalizedTop}; height: {normalizedDiameter};"
  class="w-px! min-w-0! min-h-0! bg-transparent! border-none! overflow-visible! [transform:translate(0,-50%)]"
>
  {#if showTooltip && normalizedLabel}
    <HoverTooltip
      text={normalizedLabel}
      placement={tooltipPlacement}
      wrapperClass="block"
      style="width: {normalizedWidth}; height: {normalizedDiameter};"
      groupAriaLabel={tooltipAriaLabel}
    >
      <span
        aria-hidden="true"
        class="absolute top-1/2 -translate-y-1/2 {pinSideClass} {pinShapeClass}"
        style="width: {normalizedWidth}; height: {normalizedDiameter}; background-color: {normalizedColor}; clip-path: {pinClipPath || 'none'};"
      ></span>
    </HoverTooltip>
  {:else}
    <span
      aria-hidden="true"
      class="absolute top-1/2 -translate-y-1/2 {pinSideClass} {pinShapeClass}"
      style="width: {normalizedWidth}; height: {normalizedDiameter}; background-color: {normalizedColor}; clip-path: {pinClipPath || 'none'};"
    ></span>
  {/if}
</Handle>
