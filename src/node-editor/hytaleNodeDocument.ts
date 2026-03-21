import type * as vscode from "vscode";
import { type AssetDocumentShape } from "../shared/node-editor/assetTypes";

export class HytaleNodeDocument implements vscode.CustomDocument {
  private _documentRoot: AssetDocumentShape;
  private _version = 0;
  private _eol: "\n" | "\r\n";

  constructor(
    public readonly uri: vscode.Uri,
    documentRoot: AssetDocumentShape,
    eol: "\n" | "\r\n",
  ) {
    this._documentRoot = structuredClone(documentRoot);
    this._eol = eol;
  }

  get documentRoot(): AssetDocumentShape {
    return this._documentRoot;
  }

  get version(): number {
    return this._version;
  }

  get eol(): "\n" | "\r\n" {
    return this._eol;
  }

  applyDocumentRoot(documentRoot: AssetDocumentShape): number {
    this._documentRoot = structuredClone(documentRoot);
    this._version += 1;
    return this._version;
  }

  replaceDocumentRoot(documentRoot: AssetDocumentShape, eol: "\n" | "\r\n"): number {
    this._documentRoot = structuredClone(documentRoot);
    this._eol = eol;
    this._version += 1;
    return this._version;
  }

  dispose(): void {}
}
