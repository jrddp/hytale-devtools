import type * as vscode from "vscode";

export class HytaleNpcRoleDocument implements vscode.CustomDocument {
  private _text: string;
  private _eol: vscode.EndOfLine;
  private _revision = 0;

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

  replaceText(text: string, eol: vscode.EndOfLine = this._eol): number {
    this._text = text;
    this._eol = eol;
    this._revision += 1;
    return this._revision;
  }

  dispose(): void {}
}
