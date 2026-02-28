<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import HoverTooltip from "../components/HoverTooltip.svelte";
  import { readColorForCss } from "../node-editor/utils/colors";
  import { type NodePin } from "@shared/node-editor/workspaceTypes";
  import { PIN_WIDTH_PX } from "src/constants";

  const DIAMETER_PX = PIN_WIDTH_PX * 2;

  const {
    nodeId,
    pin,
    type,
    showTooltip = false,
    ...props
  }: {
    nodeId: string;
    pin: NodePin;
    type: "target" | "source";
    showTooltip?: boolean;
    class?: string;
    style?: string;
  } = $props();

  const id = $derived(pin.schemaKey);

  const side = $derived(type === "source" ? "right" : "left");
  // $: pinSideClass = side === "right" ? "right-0" : "left-0";

  const cssColor = $derived(readColorForCss(pin.color));

  const shapeClass = $derived(
    pin.multiplicity === "map" || pin.multiplicity === "multiple"
      ? "rounded-none"
      : side === "right"
        ? "rounded-l-full"
        : "rounded-r-full",
  );

  const clipPath = $derived(
    pin.multiplicity === "map"
      ? side === "left"
        ? "polygon(0 0, 100% 50%, 0 100%)"
        : "polygon(100% 0, 0 50%, 100% 100%)"
      : undefined,
  );
</script>

<Handle
  {id}
  {type}
  position={side == "left" ? Position.Left : Position.Right}
  style="height: {DIAMETER_PX}px; {props.style}"
  class="bg-transparent! w-px! min-w-0! min-h-0! border-none! overflow-visible! transform-[translate(0,-50%)] {props.class}"
>
  {#if showTooltip && pin.label}
    <HoverTooltip
      text={pin.label}
      placement={side}
      wrapperClass="block"
      style="width: {PIN_WIDTH_PX}px; height: {DIAMETER_PX}px;"
    >
      <span
        aria-hidden="true"
        class="absolute top-1/2 -translate-y-1/2 {shapeClass} {side == 'left' ? 'left-0' : 'right-0'}"
        style="width: {PIN_WIDTH_PX}px; height: {DIAMETER_PX}px; background-color: {cssColor}; clip-path: {clipPath ||
          'none'};"
      ></span>
    </HoverTooltip>
  {:else}
    <span
      aria-hidden="true"
      class="absolute top-1/2 -translate-y-1/2 {shapeClass} {side == 'left' ? 'left-0' : 'right-0'}"
      style="width: {PIN_WIDTH_PX}px; height: {DIAMETER_PX}px; background-color: {cssColor}; clip-path: {clipPath ||
        'none'};"
    ></span>
  {/if}
</Handle>
