<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import { useSvelteFlow } from "@xyflow/svelte";
  import { type RawJsonNodeType } from "@node-editor/common";
  import { DEFAULT_RAW_JSON_TEXT } from "@node-editor/constants";
  import { createNodePropertiesUpdatedEdit } from "@node-editor/node-editor/utils/graphDocument";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
  import BaseNode from "./BaseNode.svelte";

  const RAW_JSON_FIELD: NodeField = {
    schemaKey: "Data",
    localId: "Data",
    label: "Data",
    type: "text",
    isSet: true,
  };

  const { id, ...props }: RawJsonNodeType = $props();
  const { updateNodeData } = useSvelteFlow();
  const workspace = useNodeEditorSession();

  const dataFieldValue = $derived(
    typeof props.data?.jsonString === "string" ? props.data.jsonString : DEFAULT_RAW_JSON_TEXT,
  );

  function updateData(nextValue: unknown) {
    const nextJsonString =
      typeof nextValue === "string" ? nextValue : String(nextValue ?? DEFAULT_RAW_JSON_TEXT);
    updateNodeData(id, {
      jsonString: nextJsonString,
    });
    const edit = createNodePropertiesUpdatedEdit([
      {
        type: "raw-json",
        nodeId: id,
        beforeJsonString: dataFieldValue,
        afterJsonString: nextJsonString,
      },
    ]);
    if (edit) {
      workspace.applyGraphEdit(edit);
    }
  }
</script>

<BaseNode {id} {...props}>
  <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
    <FieldEditor nodeId={id} {...RAW_JSON_FIELD} value={dataFieldValue} onconfirm={updateData} />
  </div>
</BaseNode>
