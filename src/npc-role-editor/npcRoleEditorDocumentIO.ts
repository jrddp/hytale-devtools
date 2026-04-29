import * as vscode from "vscode";

export async function readNpcRoleTextFromUri(
  uri: vscode.Uri,
): Promise<{ text: string; eol: vscode.EndOfLine }> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = stripBom(Buffer.from(bytes).toString("utf8"));
  return {
    text,
    eol: detectTextEol(text),
  };
}

export async function writeNpcRoleTextToUri(
  uri: vscode.Uri,
  text: string,
  eol: vscode.EndOfLine,
): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(normalizeTextEol(text, eol), "utf8"));
}

export function normalizeTextEol(text: string, eol: vscode.EndOfLine): string {
  const targetEol = eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  return text.replace(/\r\n|\r|\n/g, targetEol);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectTextEol(text: string): vscode.EndOfLine {
  return text.includes("\r\n") ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF;
}
