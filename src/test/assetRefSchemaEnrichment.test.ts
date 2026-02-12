import * as assert from 'assert';
import {
    computeWorkspaceKey,
    enrichSchemaDocumentForAssetRefs,
    mapServerRelativePathsToAssetIds,
    parseStoreInfoEntries
} from '../schema/assetRefSchemaEnrichment';

suite('Asset Ref Schema Enrichment Test Suite', () => {

    test('parseStoreInfoEntries normalizes and deduplicates store entries', () => {
        const stores = parseStoreInfoEntries({
            stores: [
                {
                    assetSimpleName: 'SoundEvent',
                    path: 'Audio/SoundEvents',
                    extension: 'json'
                },
                {
                    assetSimpleName: 'SoundEvent',
                    path: '/Audio/SoundEvents/',
                    extension: '.json'
                },
                {
                    assetSimpleName: 'ParticleSystem',
                    path: 'Particles',
                    extension: '.particlesystem'
                },
                {
                    assetSimpleName: 'AssetTypeOnlyThing',
                    path: 'Server/Audio/GeneratedTypes',
                    rootPath: '/Server',
                    extension: '.json'
                },
                {
                    assetSimpleName: 'CommonAssetType',
                    path: 'Common/Audio/GeneratedTypes',
                    rootPath: '/Common',
                    extension: '.json'
                },
                {
                    assetSimpleName: 'InvalidNoPath',
                    path: '',
                    extension: '.json'
                }
            ]
        });

        assert.deepStrictEqual(stores, [
            {
                assetSimpleName: 'AssetTypeOnlyThing',
                path: 'Server/Audio/GeneratedTypes',
                extension: '.json',
                assetCount: undefined
            },
            {
                assetSimpleName: 'CommonAssetType',
                path: 'Common/Audio/GeneratedTypes',
                extension: '.json',
                assetCount: undefined
            },
            {
                assetSimpleName: 'ParticleSystem',
                path: 'Server/Particles',
                extension: '.particlesystem',
                assetCount: undefined
            },
            {
                assetSimpleName: 'SoundEvent',
                path: 'Server/Audio/SoundEvents',
                extension: '.json',
                assetCount: undefined
            }
        ]);
    });

    test('mapServerRelativePathsToAssetIds extracts IDs by store path and extension', () => {
        const stores = [
            {
                assetSimpleName: 'RootInteraction',
                path: 'Server/Item/RootInteractions',
                extension: '.json'
            },
            {
                assetSimpleName: 'SoundEvent',
                path: 'Server/Audio/SoundEvents',
                extension: '.json'
            },
            {
                assetSimpleName: 'ParticleSystem',
                path: 'Server/Particles',
                extension: '.particlesystem'
            },
            {
                assetSimpleName: 'CommonAssetType',
                path: 'Common/Audio/GeneratedTypes',
                extension: '.json'
            }
        ];

        const indexedValues = mapServerRelativePathsToAssetIds([
            'Server/Item/RootInteractions/Combat/Basic.json',
            'Server/Audio/SoundEvents/Player/Jump.json',
            'Server/Audio/SoundEvents/NotJson.txt',
            'Server/Particles/Fireball.particlesystem',
            'Server/Particles/WrongExt.json',
            'Common/Audio/GeneratedTypes/Alpha.json'
        ], stores);

        assert.deepStrictEqual(indexedValues.get('RootInteraction'), ['Combat/Basic']);
        assert.deepStrictEqual(indexedValues.get('SoundEvent'), ['Player/Jump']);
        assert.deepStrictEqual(indexedValues.get('ParticleSystem'), ['Fireball']);
        assert.deepStrictEqual(indexedValues.get('CommonAssetType'), ['Alpha']);
    });

    test('enrichSchemaDocumentForAssetRefs injects known-value refs while remaining permissive', () => {
        const knownValues = new Map<string, readonly string[]>([
            ['SoundEvent', ['Player/Jump']],
            ['Item', ['Weapons/Sword']]
        ]);

        const enrichedDocument = enrichSchemaDocumentForAssetRefs({
            type: 'object',
            properties: {
                Sound: {
                    type: 'string',
                    hytaleAssetRef: 'SoundEvent'
                },
                OptionalItem: {
                    type: ['string', 'null'],
                    hytaleAssetRef: 'Item'
                },
                ExistingAnyOf: {
                    anyOf: [
                        { type: 'string' },
                        { type: 'object' }
                    ],
                    hytaleAssetRef: 'Item'
                },
                UnknownRef: {
                    type: 'string',
                    hytaleAssetRef: 'NotInKnownValues'
                }
            }
        }, knownValues) as Record<string, unknown>;

        const properties = enrichedDocument.properties as Record<string, unknown>;
        const soundNode = properties.Sound as Record<string, unknown>;
        const optionalItemNode = properties.OptionalItem as Record<string, unknown>;
        const existingAnyOfNode = properties.ExistingAnyOf as Record<string, unknown>;
        const unknownRefNode = properties.UnknownRef as Record<string, unknown>;

        assert.deepStrictEqual(soundNode.anyOf, [
            { $ref: '../hytale-known-values.json#/$defs/SoundEvent' },
            { type: 'string' }
        ]);
        assert.deepStrictEqual(optionalItemNode.anyOf, [
            { $ref: '../hytale-known-values.json#/$defs/Item' },
            { type: ['string', 'null'] }
        ]);
        assert.deepStrictEqual(existingAnyOfNode.anyOf, [
            { $ref: '../hytale-known-values.json#/$defs/Item' },
            { type: 'string' },
            { type: 'object' }
        ]);
        assert.strictEqual('anyOf' in unknownRefNode, false);
    });

    test('computeWorkspaceKey is stable regardless workspace order', () => {
        const keyA = computeWorkspaceKey(['/tmp/workspace-a', '/tmp/workspace-b']);
        const keyB = computeWorkspaceKey(['/tmp/workspace-b', '/tmp/workspace-a']);

        assert.strictEqual(keyA, keyB);
    });
});
