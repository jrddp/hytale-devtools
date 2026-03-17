<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import { useSvelteFlow } from "@xyflow/svelte";
  import { type RawJsonNodeType } from "src/common";
  import { DEFAULT_RAW_JSON_TEXT } from "src/constants";
  import { applyDocumentState } from "src/workspace.svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
  import BaseNode from "./BaseNode.svelte";

  const RAW_JSON_FIELD: NodeField = {
    schemaKey: "Data",
    localId: "Data",
    label: "Data",
    type: "text",
  };

  const { id, ...props }: RawJsonNodeType = $props();
  const { updateNodeData } = useSvelteFlow();

  const dataFieldValue = $derived(
    typeof props.data?.jsonString === "string" ? props.data.jsonString : DEFAULT_RAW_JSON_TEXT,
  );

  function updateData(nextValue: unknown) {
    updateNodeData(id, {
      jsonString:
        typeof nextValue === "string" ? nextValue : String(nextValue ?? DEFAULT_RAW_JSON_TEXT),
    });
    applyDocumentState("raw-json-field-updated");
  }
</script>

<BaseNode {id} {...props}>
  <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
    <FieldEditor nodeId={id} {...RAW_JSON_FIELD} value={dataFieldValue} onconfirm={updateData} />
  </div>
</BaseNode>
