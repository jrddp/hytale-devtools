import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CompanionSnapshotRuntime } from '../shared/companion/snapshotStore';

suite('Companion Snapshot Store Test Suite', () => {
    test('registerWorkspace preloads snapshot and resolves mapped property', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-snapshot-store-'));
        const workspacePath = path.join(tempRoot, 'workspace');
        const globalStoragePath = path.join(tempRoot, 'global-storage');
        const exportRoot = path.join(globalStoragePath, 'release');
        const schemasPath = path.join(exportRoot, 'schemas');
        const indexesPath = path.join(exportRoot, 'indexes', 'registeredAssets');

        fs.mkdirSync(workspacePath, { recursive: true });
        fs.mkdirSync(schemasPath, { recursive: true });
        fs.mkdirSync(indexesPath, { recursive: true });

        fs.writeFileSync(path.join(workspacePath, 'gradle.properties'), 'patchline=release\n', 'utf8');
        fs.writeFileSync(
            path.join(exportRoot, 'schema_mappings.json'),
            JSON.stringify({
                hytaleVersion: 'test',
                generatedAt: '2026-02-20T00:00:00Z',
                schemaMappings: {
                    'json.schemas': [
                        {
                            fileMatch: ['/Server/Item/**/*.json'],
                            url: './Schema/Item.json'
                        }
                    ]
                }
            }),
            'utf8'
        );
        fs.writeFileSync(
            path.join(schemasPath, 'Item.json'),
            JSON.stringify({
                type: 'object',
                properties: {
                    Name: {
                        type: 'string',
                        hytaleDevtools: {
                            semanticKind: 'literalChoice',
                            values: ['A', 'B']
                        }
                    }
                }
            }),
            'utf8'
        );
        fs.writeFileSync(
            path.join(indexesPath, 'BlockType.json'),
            JSON.stringify({
                indexKind: 'registeredAssets',
                key: 'BlockType',
                values: {
                    Stone: {
                        sourcedFromFile: 'Server/Item/Block/Stone.json'
                    }
                }
            }),
            'utf8'
        );

        const runtime = new CompanionSnapshotRuntime({
            globalStorageUri: { fsPath: globalStoragePath }
        } as never);

        runtime.registerWorkspace(workspacePath);
        await waitForSnapshotReady(runtime, workspacePath, 5000);

        const result = runtime.resolveProperty({
            workspacePath,
            assetFilePath: '/Server/Item/Test/Foo.json',
            jsonPointer: '/Name'
        });

        runtime.dispose();

        assert.strictEqual(result.kind, 'ready');
        if (result.kind !== 'ready') {
            return;
        }

        assert.strictEqual(result.schemaFile, 'Item.json');
        assert.strictEqual(result.property.propertyKey, 'Item.json#/properties/Name');
    });
});

async function waitForSnapshotReady(
    runtime: CompanionSnapshotRuntime,
    workspacePath: string,
    timeoutMs: number
): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
        const state = runtime.getSnapshotState(workspacePath);
        if (state.kind === 'ready') {
            return;
        }

        if (state.kind === 'error' || state.kind === 'missing_exports') {
            throw new Error(state.message ?? `Snapshot failed with state "${state.kind}".`);
        }

        await delay(50);
    }

    throw new Error(`Timed out waiting for snapshot to become ready for workspace "${workspacePath}".`);
}

function delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
