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

    test('resolveSchemaDefinitionsBatch resolves mapped schema definitions', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-snapshot-schema-definition-'));
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
                schemaMappings: {
                    'json.schemas': []
                }
            }),
            'utf8'
        );
        fs.writeFileSync(
            path.join(schemasPath, 'common.json'),
            JSON.stringify({
                definitions: {
                    DelimiterAsset: {
                        allOf: [
                            {
                                type: 'object',
                                properties: {
                                    Min: {
                                        type: 'number'
                                    }
                                }
                            },
                            {
                                type: 'object',
                                properties: {
                                    Max: {
                                        type: 'number',
                                        hytaleDevtools: {
                                            semanticKind: 'literalChoice',
                                            values: ['Low', 'Medium', 'High']
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            }),
            'utf8'
        );
        fs.writeFileSync(
            path.join(indexesPath, 'Stub.json'),
            JSON.stringify({
                indexKind: 'registeredAssets',
                key: 'Stub',
                values: {}
            }),
            'utf8'
        );

        const runtime = new CompanionSnapshotRuntime({
            globalStorageUri: { fsPath: globalStoragePath }
        } as never);

        runtime.registerWorkspace(workspacePath);
        await waitForSnapshotReady(runtime, workspacePath, 5000);

        const result = runtime.resolveSchemaDefinitionsBatch({
            workspacePath,
            items: [
                {
                    nodeId: 'Node-A',
                    schemaDefinition: 'common.json#/definitions/DelimiterAsset@1'
                },
                {
                    nodeId: 'Node-B',
                    schemaDefinition: 'common.json#/definitions/DelimiterAsset'
                },
                {
                    nodeId: 'Node-C',
                    schemaDefinition: 'common.json#/definitions/UnknownAsset'
                }
            ]
        });

        runtime.dispose();

        assert.strictEqual(result.results.length, 3);

        const nodeA = result.results.find(entry => entry.nodeId === 'Node-A');
        assert.ok(nodeA);
        assert.strictEqual(nodeA?.kind, 'ready');
        if (nodeA?.kind === 'ready') {
            assert.strictEqual(nodeA.schemaFile, 'common.json');
            assert.strictEqual(nodeA.jsonPointer, '/definitions/DelimiterAsset');
            assert.strictEqual(nodeA.resolvedPointer, '/definitions/DelimiterAsset/allOf/1');
            assert.strictEqual(nodeA.variantIndex, 1);
            assert.deepStrictEqual(nodeA.autocompleteValuesBySchemaKey?.Max, ['High', 'Low', 'Medium']);
        }

        const nodeB = result.results.find(entry => entry.nodeId === 'Node-B');
        assert.ok(nodeB);
        assert.strictEqual(nodeB?.kind, 'ready');
        if (nodeB?.kind === 'ready') {
            assert.strictEqual(nodeB.schemaFile, 'common.json');
            assert.strictEqual(nodeB.resolvedPointer, '/definitions/DelimiterAsset');
            assert.strictEqual(nodeB.variantIndex, null);
        }

        const nodeC = result.results.find(entry => entry.nodeId === 'Node-C');
        assert.ok(nodeC);
        assert.strictEqual(nodeC?.kind, 'schema_unresolved');
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
