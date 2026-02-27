export function buildFieldInputId(
  prefix: string,
  nodeId: string | undefined,
  schemaKey: string | undefined,
  type: string | undefined,
): string {
  return [prefix, nodeId, schemaKey, type].join("-");
}

/** Expand this object on field elements to prevent pointer events from propagating to Svelte Flow and selecting the node. */
export const noMousePropogation = {
  onpointerdown: (e: PointerEvent) => e.stopPropagation(),
  onmousedown: (e: MouseEvent) => e.stopPropagation(),
  onclick: (e: MouseEvent) => e.stopPropagation(),
};
