import {
  focusNextEditable,
  getEditableRoot,
  isPlainEnterNavigationEvent,
} from "../../../../shared/components/inputs/inputCommitBehavior";

export { isPlainEnterNavigationEvent };

export function getNodeEditorRoot(element: Element): ParentNode | null {
  return getEditableRoot(element, "[data-node-editor-root]");
}

export function focusNextEditableInNode(currentElement: HTMLElement): boolean {
  return focusNextEditable(currentElement, "[data-node-editor-root]");
}
