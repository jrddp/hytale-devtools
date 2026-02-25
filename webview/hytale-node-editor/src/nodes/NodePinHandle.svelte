<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import HoverTooltip from "../components/HoverTooltip.svelte";
  import { getDefaultPinColor, readPinColor } from "../node-editor/utils/pinColorUtils";

  export let id;
  export let type = "target";
  export let side = "left";
  export let top = "0px";
  export let width = 12;
  export let label = "";
  export let showTooltip = false;
  export let color = undefined;
  export let connectionMultiplicity = "single";

  $: pinSide = side === "right" ? "right" : "left";
  $: pinPosition = pinSide === "right" ? Position.Right : Position.Left;
  $: pinType = type === "source" ? "source" : "target";
  $: pinTop = readTopValue(top);
  $: pinWidth = readPinWidth(width);
  $: pinDiameter = readPinDiameter(pinWidth);
  $: pinLabel = typeof label === "string" ? label : "";
  $: pinColor = readPinColor(color) ?? getDefaultPinColor();
  $: pinMultiplicity = readConnectionMultiplicity(connectionMultiplicity);
  $: pinSideClass = pinSide === "right" ? "right-0" : "left-0";
  $: pinShapeClass = readPinShapeClass(pinMultiplicity, pinSide);
  $: pinClipPath = readPinClipPath(pinMultiplicity, pinSide);
  $: tooltipPlacement = pinSide === "right" ? "right" : "left";
  $: tooltipAriaLabel = pinLabel
    ? `${pinSide === "right" ? "Output" : "Input"} pin ${pinLabel}`
    : undefined;

  function readTopValue(candidate) {
    if (Number.isFinite(candidate)) {
      return `${candidate}px`;
    }

    if (typeof candidate === "string") {
      return candidate;
    }

    return "0px";
  }

  function readPinWidth(candidate) {
    if (Number.isFinite(candidate)) {
      return `${Number(candidate)}px`;
    }

    if (typeof candidate === "string") {
      return candidate;
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
  type={pinType}
  position={pinPosition}
  {id}
  style="top: {pinTop}; height: {pinDiameter};"
  class="w-px! min-w-0! min-h-0! bg-transparent! border-none! overflow-visible! [transform:translate(0,-50%)]"
>
  {#if showTooltip && pinLabel}
    <HoverTooltip
      text={pinLabel}
      placement={tooltipPlacement}
      wrapperClass="block"
      style="width: {pinWidth}; height: {pinDiameter};"
      groupAriaLabel={tooltipAriaLabel}
    >
      <span
        aria-hidden="true"
        class="absolute top-1/2 -translate-y-1/2 {pinSideClass} {pinShapeClass}"
        style="width: {pinWidth}; height: {pinDiameter}; background-color: {pinColor}; clip-path: {pinClipPath ||
          'none'};"
      ></span>
    </HoverTooltip>
  {:else}
    <span
      aria-hidden="true"
      class="absolute top-1/2 -translate-y-1/2 {pinSideClass} {pinShapeClass}"
      style="width: {pinWidth}; height: {pinDiameter}; background-color: {pinColor}; clip-path: {pinClipPath ||
        'none'};"
    ></span>
  {/if}
</Handle>
