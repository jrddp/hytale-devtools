<script lang="ts">
  import {
    autoUpdate,
    computePosition,
    flip,
    offset,
    shift,
    type Middleware,
    type Placement,
    type Strategy,
  } from "@floating-ui/dom";
  import MarkdownPreviewCard from "./MarkdownPreviewCard.svelte";

  let {
    referenceElement,
    title,
    html,
    placement = "right-start",
    strategy = "absolute",
    middleware = [offset(8), flip(), shift({ padding: 8 })],
    class: className = "",
  }: {
    referenceElement: HTMLElement | null;
    title: string;
    html: string;
    placement?: Placement;
    strategy?: Strategy;
    middleware?: Middleware[];
    class?: string;
  } = $props();

  let contentElement = $state<HTMLElement | null>(null);

  async function updatePosition() {
    if (!referenceElement || !contentElement) {
      return;
    }

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
    if (!referenceElement || !contentElement) {
      return;
    }

    Object.assign(contentElement.style, {
      position: strategy,
      top: "0px",
      left: "0px",
      width: "max-content",
      zIndex: "3003",
      pointerEvents: "none",
    });

    return autoUpdate(referenceElement, contentElement, updatePosition);
  });

  $effect(() => {
    if (!contentElement) {
      return;
    }

    const element = contentElement;
    document.body.appendChild(element);

    return () => {
      element.remove();
    };
  });
</script>

<div bind:this={contentElement}>
  <MarkdownPreviewCard {title} {html} class={className} />
</div>
