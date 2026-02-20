import * as path from 'path';
import * as vscode from 'vscode';
import { resolvePatchlineFromWorkspace } from '../../utils/hytalePaths';

export type SupportedPatchline = 'release' | 'pre-release';

export function toSupportedPatchline(value: string): SupportedPatchline {
    return value === 'pre-release' ? 'pre-release' : 'release';
}

export function resolveCompanionExportRootFromPatchline(globalStoragePath: string, patchline: SupportedPatchline): string {
    return path.join(globalStoragePath, patchline);
}

export function resolveCompanionExportRoot(context: vscode.ExtensionContext, workspacePath: string): string {
    const patchline = toSupportedPatchline(resolvePatchlineFromWorkspace(workspacePath));
    return resolveCompanionExportRootFromPatchline(context.globalStorageUri.fsPath, patchline);
}
