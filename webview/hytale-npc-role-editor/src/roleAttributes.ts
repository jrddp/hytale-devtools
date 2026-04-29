export const ROLE_ATTRIBUTE_SKIP_KEYS = new Set([
  "Type",
  "Parameters",
  "Instructions",
  "InteractionInstruction",
  "DeathInstruction",
  "StateTransitions",
  "MotionControllerList",
  "Content",
  "Class",
  "Interface",
  "Reference",
  "Modify",
  "TestType",
  "FailReason",
  "$Comment",
  "$Title",
  "$TODO",
  "$Author",
  "$NodeEditorMetadata",
  "$Position",
  "$NodeId",
  "$FloatingFunctionNodes",
  "$Groups",
  "$WorkspaceID",
]);

export function isNpcRoleAttributeKey(key: string): boolean {
  return !ROLE_ATTRIBUTE_SKIP_KEYS.has(key) && !key.startsWith("$");
}
