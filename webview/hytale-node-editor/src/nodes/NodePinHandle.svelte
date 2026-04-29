<script lang="ts">
  import { type NodePin } from "@shared/node-editor/workspaceTypes";
  import type { NodeEditorDiagnosticSeverity } from "@shared/node-editor/diagnostics";
  import { Handle, Position } from "@xyflow/svelte";
  import { PIN_WIDTH_PX } from "@node-editor/constants";
  import { asCssColor } from "../node-editor/utils/colors";

  const DIAMETER_PX = PIN_WIDTH_PX * 2;

  const {
    nodeId,
    pin,
    type,
    diagnosticSeverity,
    ...props
  }: {
    nodeId: string;
    pin: NodePin;
    type: "target" | "source";
    diagnosticSeverity?: NodeEditorDiagnosticSeverity;
    class?: string;
    style?: string;
  } = $props();

  const id = $derived(pin.schemaKey);

  const side = $derived(type === "source" ? "right" : "left");

  const cssColor = $derived(asCssColor(pin.color));
  const diagnosticRingColor = $derived(
    diagnosticSeverity === "error"
      ? "var(--vscode-errorForeground, #f85149)"
      : diagnosticSeverity === "warning"
        ? "var(--vscode-editorWarning-foreground, #cca700)"
        : undefined,
  );

  const clipPath = $derived.by(() => {
    switch (pin.multiplicity) {
      case "single":
        // half-circle
        return side === "left" ? "ellipse(100% 50% at 0% 50%)" : "ellipse(100% 50% at 100% 50%)";
      case "multiple":
        // rectangle
        return "none";
      case "map":
        // half-hexagon
        return side === "left"
          ? "polygon(100% 25%, 50% 0, 0 0, 0 100%, 50% 100%, 100% 75%)"
          : "polygon(0 25%, 50% 0, 100% 0, 100% 100%, 50% 100%, 0 75%)";
    }
  });
</script>

<Handle
  {id}
  {type}
  position={side == "left" ? Position.Left : Position.Right}
  style="width: {PIN_WIDTH_PX}px; height: {DIAMETER_PX}px; background-color: {cssColor}; clip-path: {clipPath ||
    'none'}; {diagnosticRingColor ? `box-shadow: 0 0 0 2px ${diagnosticRingColor};` : ''} {props.style}"
  class="relative! top-auto! rounded-none! border-none! transform-none! {props.class}"
/>
