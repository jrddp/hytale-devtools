export const persistedRuntimeKeys = {
  nodeEditorMetadata: "$NodeEditorMetadata",
  workspaceName: "$WorkspaceID",
  nodes: "$Nodes",
  floatingNodes: "$FloatingNodes",
  links: "$Links",
  groups: "$Groups",
  comments: "$Comments",
  nodeId: "$NodeId",
  comment: "$Comment",
  position: "$Position",
  title: "$Title",
  templateId: "$TemplateId",
  editorFields: "$EditorFields",
  inputConnectionIndex: "$InputConnectionIndex",
} as const;

export const internalRuntimeKeys = {
  templateId: "templateId",
  values: "values",
  comment: "comment",
  titleOverride: "titleOverride",
  inputConnectionIndex: "inputConnectionIndex",
  schemaInfo: "schemaInfo",
  unparsedMetadata: "unparsedMetadata",
} as const;
