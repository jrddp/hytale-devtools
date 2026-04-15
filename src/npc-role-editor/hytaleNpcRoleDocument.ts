import type * as vscode from "vscode";
import type { ParsedNpcRoleDocument } from "../shared/npc-role-editor/documentParsing";
import type { NpcGraphTargetWorkspaceRoot } from "../shared/npc-role-editor/graphTargets";
import type { NpcRoleJson } from "../shared/npc-role-editor/documentTypes";
import type { NodeEditorGraphDocument } from "../shared/node-editor/graphTypes";

export type CachedNpcGraphDocument = {
  workspaceRoot: NpcGraphTargetWorkspaceRoot;
  graphDocument: NodeEditorGraphDocument;
};

export class HytaleNpcRoleDocument implements vscode.CustomDocument {
  private _text: string;
  private _eol: vscode.EndOfLine;
  private _revision = 0;
  private _parsedDocument: NpcRoleJson | undefined;
  private _topLevelKeyOrder: string[] | undefined;
  private readonly _graphDocumentsByFieldPath = new Map<string, CachedNpcGraphDocument>();

  constructor(
    public readonly uri: vscode.Uri,
    text: string,
    eol: vscode.EndOfLine,
  ) {
    this._text = text;
    this._eol = eol;
  }

  get text(): string {
    return this._text;
  }

  get eol(): vscode.EndOfLine {
    return this._eol;
  }

  get revision(): number {
    return this._revision;
  }

  getParsedDocument(parseDocument: (text: string) => ParsedNpcRoleDocument): ParsedNpcRoleDocument {
    if (!this._parsedDocument || !this._topLevelKeyOrder) {
      const parsed = parseDocument(this._text);
      this._parsedDocument = parsed.document;
      this._topLevelKeyOrder = [...parsed.topLevelKeyOrder];
    }

    return {
      document: this._parsedDocument,
      topLevelKeyOrder: [...this._topLevelKeyOrder],
    };
  }

  commitParsedDocument({
    text,
    eol,
    parsedDocument,
    topLevelKeyOrder,
  }: {
    text: string;
    eol?: vscode.EndOfLine;
    parsedDocument: NpcRoleJson;
    topLevelKeyOrder: string[];
  }): number {
    this._text = text;
    this._eol = eol ?? this._eol;
    this._parsedDocument = parsedDocument;
    this._topLevelKeyOrder = [...topLevelKeyOrder];
    this._revision += 1;
    return this._revision;
  }

  getCachedGraphDocument(fieldPath: string): CachedNpcGraphDocument | undefined {
    return this._graphDocumentsByFieldPath.get(fieldPath);
  }

  setCachedGraphDocument(fieldPath: string, cache: CachedNpcGraphDocument): void {
    this._graphDocumentsByFieldPath.set(fieldPath, cache);
  }

  clearGraphCaches(): void {
    this._graphDocumentsByFieldPath.clear();
  }

  replaceText(text: string, eol: vscode.EndOfLine = this._eol): number {
    this._text = text;
    this._eol = eol;
    this._parsedDocument = undefined;
    this._topLevelKeyOrder = undefined;
    this._graphDocumentsByFieldPath.clear();
    this._revision += 1;
    return this._revision;
  }

  dispose(): void {}
}
