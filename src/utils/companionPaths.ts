import * as path from 'path';
import * as vscode from 'vscode';

export interface CompanionPaths {
    extensionStoragePath: string;
    companionProjectPath: string;
    companionModArtifactPath: string;
    schemaOutputPath: string;
}

export function getCompanionPaths(context: vscode.ExtensionContext): CompanionPaths {
    const extensionStoragePath = context.globalStorageUri.fsPath;
    const companionProjectPath = path.join(extensionStoragePath, 'companion', 'HytaleDevtoolsCompanion');
    const companionModArtifactPath = path.join(companionProjectPath, 'build', 'libs');

    return {
        extensionStoragePath,
        companionProjectPath,
        companionModArtifactPath,
        schemaOutputPath: path.join(extensionStoragePath, 'schemas')
    };
}
