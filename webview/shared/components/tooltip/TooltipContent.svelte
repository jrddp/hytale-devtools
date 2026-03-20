<script lang="ts">
  import {
    autoUpdate,
    computePosition,
    flip,
    offset,
    shift,
    type Middleware,
    type Placement,
    type ReferenceElement,
    type Strategy,
  } from "@floating-ui/dom";
  import type { Snippet } from "svelte";
  import type { TooltipController } from "./createTooltip.svelte";

  let {
    tooltip,
    children,
    placement = "top",
    strategy = "absolute",
    middleware = [offset(8), flip(), shift({ padding: 8 })],
    class: className = "tooltip",
  }: {
    tooltip: TooltipController;
    children: Snippet;
    placement?: Placement;
    strategy?: Strategy;
    middleware?: Middleware[];
    class?: string;
  } = $props();

  let contentElement = $state<HTMLElement | null>(null);

  function isElement(referenceElement: ReferenceElement): referenceElement is Element {
    return referenceElement instanceof Element;
  }

  async function updatePosition() {
    const referenceElement = tooltip.getReferenceElement();

    if (!referenceElement || !contentElement) return;

    const { x, y } = await computePosition(referenceElement, contentElement, {
      placement,
      strategy,
      middleware,
    });

    Object.assign(contentElement.style, {
      position: strategy,
      left: `${x}px`,
      top: `${y}px`,
    });
  }

  $effect(() => {
    if (!tooltip.isOpen() || !contentElement) return;
    void tooltip.getReferenceVersion();

    Object.assign(contentElement.style, {
      position: strategy,
      top: "0px",
      left: "0px",
      width: "max-content",
      zIndex: "3002",
      pointerEvents: tooltip.interactive ? "auto" : "none",
    });

    void updatePosition();
  });

  $effect(() => {
    if (!tooltip.isOpen() || !contentElement) return;

    const referenceElement = tooltip.getReferenceElement();
    if (!referenceElement || tooltip.usesVirtualReference() || !isElement(referenceElement)) return;

    return autoUpdate(referenceElement, contentElement, updatePosition);
  });

  $effect(() => {
    if (!contentElement) return;

    const element = contentElement;
    document.body.appendChild(element);

    return () => {
      element.remove();
    };
  });
</script>

{#if tooltip.isOpen()}
  <div
    bind:this={contentElement}
    class={className}
    role="tooltip"
    onmouseenter={tooltip.interactive ? tooltip.handleContentPointerEnter : undefined}
    onmouseleave={tooltip.interactive ? tooltip.handleContentPointerLeave : undefined}
  >
    {@render children()}
  </div>
{/if}
