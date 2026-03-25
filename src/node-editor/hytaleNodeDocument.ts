import type * as vscode from "vscode";
import { applyNodeEditorGraphEdit } from "../shared/node-editor/graphEditUtils";
import {
  type NodeEditorGraphDocument,
  type NodeEditorGraphEdit,
} from "../shared/node-editor/graphTypes";

export class HytaleNodeDocument implements vscode.CustomDocument {
  private _graphDocument: NodeEditorGraphDocument;
  private _version = 0;
  private _eol: "\n" | "\r\n";

  constructor(
    public readonly uri: vscode.Uri,
    graphDocument: NodeEditorGraphDocument,
    eol: "\n" | "\r\n",
  ) {
    this._graphDocument = structuredClone(graphDocument);
    this._eol = eol;
  }

  get graphDocument(): NodeEditorGraphDocument {
    return this._graphDocument;
  }

  get version(): number {
    return this._version;
  }

  get eol(): "\n" | "\r\n" {
    return this._eol;
  }

  applyGraphEdit(edit: NodeEditorGraphEdit, target: "before" | "after" = "after"): number {
    applyNodeEditorGraphEdit(this._graphDocument, edit, target);
    this._version += 1;
    return this._version;
  }

  replaceGraphDocument(graphDocument: NodeEditorGraphDocument, eol: "\n" | "\r\n"): number {
    this._graphDocument = structuredClone(graphDocument);
    this._eol = eol;
    this._version += 1;
    return this._version;
  }

  dispose(): void {}
}
