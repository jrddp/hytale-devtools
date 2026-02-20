import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveCompanionExportRoot } from './exportRoot';
import { loadIndexShardsFromDirectory } from './indexStore';
import { buildPropertyIndex } from './propertyIndex';
import { resolvePropertyFromSchemaAndJsonPointer } from './propertyResolver';
import { parseSchemaMappingRules, matchSchemaFileForAssetPath } from './schemaMappings';
import { loadRawSchemasFromDirectory, loadResolvedSchemasFromDirectory } from './schemaStore';
import {
    CompanionSchemaMappingsDocument,
    CompanionSnapshot,
    CompanionSnapshotState,
    ResolvePropertyRequest,
    ResolvePropertyResult
} from './types';

const WATCH_INTERVAL_MS = 750;
const RELOAD_DEBOUNCE_MS = 300;

interface WorkspaceRecord {
    workspacePath: string;
    exportRoot: string;
    stopSchemaMappingsWatcher: () => void;
    stopGradleWatcher: () => void;
    schemaReloadTimer?: NodeJS.Timeout;
    patchlineReloadTimer?: NodeJS.Timeout;
}

interface SnapshotRecord {
    state: CompanionSnapshotState;
    snapshot?: CompanionSnapshot;
    loadingPromise?: Promise<void>;
}

class MissingExportsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingExportsError';
    }
}

export class CompanionSnapshotRuntime implements vscode.Disposable {
    private readonly workspaces = new Map<string, WorkspaceRecord>();
    private readonly snapshots = new Map<string, SnapshotRecord>();

    constructor(private readonly context: vscode.ExtensionContext) { }

    public registerWorkspace(workspacePath: string): void {
        const existing = this.workspaces.get(workspacePath);
        if (existing) {
            return;
        }

        const exportRoot = resolveCompanionExportRoot(this.context, workspacePath);
        const workspaceRecord: WorkspaceRecord = {
            workspacePath,
            exportRoot,
            stopSchemaMappingsWatcher: () => undefined,
            stopGradleWatcher: () => undefined
        };

        workspaceRecord.stopSchemaMappingsWatcher = this.watchFile(
            path.join(exportRoot, 'schema_mappings.json'),
            () => this.scheduleSchemaReload(workspacePath)
        );
        workspaceRecord.stopGradleWatcher = this.watchFile(
            path.join(workspacePath, 'gradle.properties'),
            () => this.schedulePatchlineReload(workspacePath)
        );

        this.workspaces.set(workspacePath, workspaceRecord);
        this.ensureSnapshotLoaded(exportRoot, true);
    }

    public unregisterWorkspace(workspacePath: string): void {
        const record = this.workspaces.get(workspacePath);
        if (!record) {
            return;
        }

        if (record.schemaReloadTimer) {
            clearTimeout(record.schemaReloadTimer);
        }
        if (record.patchlineReloadTimer) {
            clearTimeout(record.patchlineReloadTimer);
        }

        record.stopSchemaMappingsWatcher();
        record.stopGradleWatcher();
        this.workspaces.delete(workspacePath);
    }

    public getSnapshotState(workspacePath: string): CompanionSnapshotState {
        const workspaceRecord = this.workspaces.get(workspacePath);
        if (!workspaceRecord) {
            return {
                kind: 'idle',
                updatedAt: Date.now(),
                message: 'Workspace is not registered.'
            };
        }

        const snapshotRecord = this.snapshots.get(workspaceRecord.exportRoot);
        if (!snapshotRecord) {
            return {
                kind: 'idle',
                updatedAt: Date.now(),
                message: 'Snapshot has not been initialized.'
            };
        }

        return snapshotRecord.state;
    }

    public resolveProperty(request: ResolvePropertyRequest): ResolvePropertyResult {
        const workspaceRecord = this.workspaces.get(request.workspacePath);
        if (!workspaceRecord) {
            return {
                kind: 'missing_exports',
                message: 'Workspace is not registered for companion snapshot loading.'
            };
        }

        const snapshotRecord = this.snapshots.get(workspaceRecord.exportRoot);
        if (!snapshotRecord || snapshotRecord.state.kind === 'idle' || snapshotRecord.state.kind === 'loading') {
            return {
                kind: 'loading',
                message: 'Companion snapshot is still loading.'
            };
        }

        if (snapshotRecord.state.kind === 'missing_exports') {
            return {
                kind: 'missing_exports',
                message: snapshotRecord.state.message ?? 'Companion export files are missing.'
            };
        }

        if (snapshotRecord.state.kind === 'error') {
            return {
                kind: 'error',
                message: snapshotRecord.state.message ?? 'Companion snapshot failed to load.'
            };
        }

        const snapshot = snapshotRecord.snapshot;
        if (!snapshot) {
            return {
                kind: 'error',
                message: 'Snapshot entered ready state without loaded data.'
            };
        }

        const schemaFile = matchSchemaFileForAssetPath(request.assetFilePath, snapshot.mappingRules);
        if (!schemaFile) {
            return {
                kind: 'schema_unresolved',
                message: `No schema mapping matches asset path "${request.assetFilePath}".`
            };
        }

        const schemaDocument = snapshot.resolvedSchemas.get(schemaFile);
        if (!schemaDocument) {
            return {
                kind: 'schema_unresolved',
                message: `Resolved schema "${schemaFile}" was not loaded from companion exports.`
            };
        }

        const property = resolvePropertyFromSchemaAndJsonPointer(
            schemaDocument,
            schemaFile,
            request.jsonPointer,
            snapshot.propertyByKey
        );
        if (!property) {
            return {
                kind: 'property_missing',
                message: `Schema property for pointer "${request.jsonPointer}" was not found in "${schemaFile}".`
            };
        }

        return {
            kind: 'ready',
            schemaFile,
            property
        };
    }

    public dispose(): void {
        for (const workspacePath of this.workspaces.keys()) {
            this.unregisterWorkspace(workspacePath);
        }
        this.snapshots.clear();
    }

    private scheduleSchemaReload(workspacePath: string): void {
        const workspaceRecord = this.workspaces.get(workspacePath);
        if (!workspaceRecord) {
            return;
        }

        if (workspaceRecord.schemaReloadTimer) {
            clearTimeout(workspaceRecord.schemaReloadTimer);
        }

        workspaceRecord.schemaReloadTimer = setTimeout(() => {
            workspaceRecord.schemaReloadTimer = undefined;
            this.ensureSnapshotLoaded(workspaceRecord.exportRoot, true);
        }, RELOAD_DEBOUNCE_MS);
    }

    private schedulePatchlineReload(workspacePath: string): void {
        const workspaceRecord = this.workspaces.get(workspacePath);
        if (!workspaceRecord) {
            return;
        }

        if (workspaceRecord.patchlineReloadTimer) {
            clearTimeout(workspaceRecord.patchlineReloadTimer);
        }

        workspaceRecord.patchlineReloadTimer = setTimeout(() => {
            workspaceRecord.patchlineReloadTimer = undefined;
            this.handlePatchlineChange(workspacePath);
        }, RELOAD_DEBOUNCE_MS);
    }

    private handlePatchlineChange(workspacePath: string): void {
        const workspaceRecord = this.workspaces.get(workspacePath);
        if (!workspaceRecord) {
            return;
        }

        const nextExportRoot = resolveCompanionExportRoot(this.context, workspacePath);
        if (workspaceRecord.exportRoot === nextExportRoot) {
            return;
        }

        workspaceRecord.stopSchemaMappingsWatcher();
        workspaceRecord.exportRoot = nextExportRoot;
        workspaceRecord.stopSchemaMappingsWatcher = this.watchFile(
            path.join(nextExportRoot, 'schema_mappings.json'),
            () => this.scheduleSchemaReload(workspacePath)
        );

        this.ensureSnapshotLoaded(nextExportRoot, true);
    }

    private ensureSnapshotLoaded(exportRoot: string, forceReload: boolean): void {
        let record = this.snapshots.get(exportRoot);
        if (!record) {
            record = {
                state: {
                    kind: 'idle',
                    updatedAt: Date.now()
                }
            };
            this.snapshots.set(exportRoot, record);
        }

        if (record.loadingPromise) {
            return;
        }

        if (!forceReload && record.state.kind === 'ready') {
            return;
        }

        record.state = {
            kind: 'loading',
            updatedAt: Date.now(),
            message: `Loading companion snapshot from ${exportRoot}`
        };

        record.loadingPromise = this.loadSnapshot(exportRoot)
            .then((snapshot) => {
                record!.snapshot = snapshot;
                record!.state = {
                    kind: 'ready',
                    updatedAt: Date.now(),
                    message: `Loaded snapshot (${snapshot.propertyByKey.size} properties, ${snapshot.indexShards.size} index shards).`
                };
            })
            .catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                record!.state = {
                    kind: error instanceof MissingExportsError ? 'missing_exports' : 'error',
                    updatedAt: Date.now(),
                    message
                };
            })
            .finally(() => {
                record!.loadingPromise = undefined;
            });
    }

    private async loadSnapshot(exportRoot: string): Promise<CompanionSnapshot> {
        const schemaMappingsPath = path.join(exportRoot, 'schema_mappings.json');
        const schemasDirectoryPath = path.join(exportRoot, 'schemas');
        const indexesDirectoryPath = path.join(exportRoot, 'indexes');

        if (!fs.existsSync(schemaMappingsPath)) {
            throw new MissingExportsError(`Missing schema mappings file at "${schemaMappingsPath}".`);
        }
        if (!fs.existsSync(schemasDirectoryPath)) {
            throw new MissingExportsError(`Missing schemas directory at "${schemasDirectoryPath}".`);
        }
        if (!fs.existsSync(indexesDirectoryPath)) {
            throw new MissingExportsError(`Missing indexes directory at "${indexesDirectoryPath}".`);
        }

        const schemaMappings = await loadSchemaMappingsDocument(schemaMappingsPath);
        const mappingRules = parseSchemaMappingRules(schemaMappings);
        const rawSchemas = await loadRawSchemasFromDirectory(schemasDirectoryPath);
        const resolvedSchemas = await loadResolvedSchemasFromDirectory(schemasDirectoryPath);
        const propertyByKey = buildPropertyIndex(resolvedSchemas);
        const indexShards = await loadIndexShardsFromDirectory(indexesDirectoryPath);

        return {
            exportRoot,
            hytaleVersion: typeof schemaMappings.hytaleVersion === 'string' ? schemaMappings.hytaleVersion : undefined,
            generatedAt: typeof schemaMappings.generatedAt === 'string' ? schemaMappings.generatedAt : undefined,
            schemaMappings,
            mappingRules,
            rawSchemas,
            resolvedSchemas,
            propertyByKey,
            indexShards
        };
    }

    private watchFile(filePath: string, onChange: () => void): () => void {
        const listener: fs.StatsListener = (current, previous) => {
            const changed = current.mtimeMs !== previous.mtimeMs
                || current.size !== previous.size
                || current.nlink !== previous.nlink;
            if (changed) {
                onChange();
            }
        };

        fs.watchFile(filePath, { interval: WATCH_INTERVAL_MS }, listener);
        return () => {
            fs.unwatchFile(filePath, listener);
        };
    }
}

export function createCompanionSnapshotRuntime(context: vscode.ExtensionContext): CompanionSnapshotRuntime {
    return new CompanionSnapshotRuntime(context);
}

async function loadSchemaMappingsDocument(schemaMappingsPath: string): Promise<CompanionSchemaMappingsDocument> {
    const content = await fs.promises.readFile(schemaMappingsPath, 'utf8');
    return JSON.parse(content) as CompanionSchemaMappingsDocument;
}
