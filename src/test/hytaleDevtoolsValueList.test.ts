import * as assert from 'assert';
import { resolveHytaleDevtoolsValueList } from '../shared/hytaleDevtoolsValueList';
import { type LoadedIndexShard } from '../shared/companion/types';

suite('Hytale Devtools Value List Test Suite', () => {
    test('literalChoice returns canonical values only', () => {
        const result = resolveHytaleDevtoolsValueList({
            semanticKind: 'literalChoice',
            values: ['Stone', 'Dirt'],
            acceptedValues: ['STONE', 'DIRT']
        });

        assert.deepStrictEqual(result, ['Dirt', 'Stone']);
    });

    test('values prefixed with "*" are ordered last', () => {
        const result = resolveHytaleDevtoolsValueList({
            semanticKind: 'literalChoice',
            values: ['*RareVariant', 'Alpha', 'Beta']
        });

        assert.deepStrictEqual(result, ['Alpha', 'Beta', '*RareVariant']);
    });

    test('symbolReference resolves registry domain from cached indexes', () => {
        const result = resolveHytaleDevtoolsValueList(
            {
                semanticKind: 'symbolReference',
                target: 'value',
                source: {
                    kind: 'registryDomain',
                    domain: 'BlockType'
                }
            },
            {
                indexShards: createIndexShardMap([
                    {
                        indexKind: 'registeredAssets',
                        key: 'BlockType',
                        values: {
                            Stone: { sourcedFromFile: 'Server/Blocks/Stone.json' },
                            Dirt: { sourcedFromFile: 'Server/Blocks/Dirt.json' }
                        }
                    }
                ])
            }
        );

        assert.deepStrictEqual(result, ['Dirt', 'Stone']);
    });

    test('symbolReference resolves localization by active locale with en-US fallback', () => {
        const indexShards = createIndexShardMap([
            {
                indexKind: 'localizationKeys',
                key: 'en-US',
                values: {
                    'Item.Name': 'Item Name',
                    'Item.Description': 'Item Description'
                }
            },
            {
                indexKind: 'localizationKeys',
                key: 'pt-BR',
                values: {
                    'Item.Name': 'Nome do Item'
                }
            }
        ]);

        const activeLocaleResult = resolveHytaleDevtoolsValueList(
            {
                semanticKind: 'symbolReference',
                target: 'value',
                source: {
                    kind: 'localization',
                    localeStrategy: 'activeThenEnUs'
                }
            },
            {
                indexShards,
                activeLocale: 'pt-BR'
            }
        );
        assert.deepStrictEqual(activeLocaleResult, ['Item.Name']);

        const fallbackResult = resolveHytaleDevtoolsValueList(
            {
                semanticKind: 'symbolReference',
                target: 'value',
                source: {
                    kind: 'localization',
                    localeStrategy: 'activeThenEnUs'
                }
            },
            {
                indexShards,
                activeLocale: 'fr-FR'
            }
        );
        assert.deepStrictEqual(fallbackResult, ['Item.Description', 'Item.Name']);
    });

    test('inlineOrReference resolves values from referenceSource', () => {
        const result = resolveHytaleDevtoolsValueList(
            {
                semanticKind: 'inlineOrReference',
                referenceSource: {
                    kind: 'registryDomain',
                    domain: 'ItemType'
                },
                acceptsInlineValue: true,
                acceptsAssetKey: true
            },
            {
                indexShards: createIndexShardMap([
                    {
                        indexKind: 'registeredAssets',
                        key: 'ItemType',
                        values: {
                            Sword: { sourcedFromFile: 'Server/Items/Sword.json' },
                            Shield: { sourcedFromFile: 'Server/Items/Shield.json' }
                        }
                    }
                ])
            }
        );

        assert.deepStrictEqual(result, ['Shield', 'Sword']);
    });

    test('assetPath resolves and filters from commonAssetsByRoot index', () => {
        const result = resolveHytaleDevtoolsValueList(
            {
                semanticKind: 'assetPath',
                requiredRoots: ['textures/icons'],
                requiredExtension: 'png'
            },
            {
                indexShards: createIndexShardMap([
                    {
                        indexKind: 'commonAssetsByRoot',
                        key: 'all',
                        values: {
                            'textures/icons': {
                                png: ['a.png', 'b.png'],
                                json: ['ignore.json']
                            },
                            'textures/other': {
                                png: ['ignore.png']
                            },
                            '.': {
                                png: ['root.png']
                            }
                        }
                    }
                ])
            }
        );

        assert.deepStrictEqual(result, ['textures/icons/a.png', 'textures/icons/b.png']);
    });

    test('symbolDefinition and color return empty list', () => {
        const symbolDefinitionResult = resolveHytaleDevtoolsValueList({
            semanticKind: 'symbolDefinition',
            namespace: {
                kind: 'importFamily',
                family: 'Density'
            }
        });
        assert.deepStrictEqual(symbolDefinitionResult, []);

        const colorResult = resolveHytaleDevtoolsValueList({
            semanticKind: 'color',
            colorMode: 'colorAlpha',
            supportsAlpha: true
        });
        assert.deepStrictEqual(colorResult, []);
    });
});

function createIndexShardMap(
    shardCandidates: Array<{
        indexKind: string;
        key: string;
        values: unknown;
    }>
): Map<string, LoadedIndexShard> {
    const result = new Map<string, LoadedIndexShard>();
    for (const shardCandidate of shardCandidates) {
        result.set(`${shardCandidate.indexKind}:${shardCandidate.key}`, {
            path: `/indexes/${shardCandidate.indexKind}/${shardCandidate.key}.json`,
            indexKind: shardCandidate.indexKind,
            key: shardCandidate.key,
            values: shardCandidate.values
        });
    }

    return result;
}
