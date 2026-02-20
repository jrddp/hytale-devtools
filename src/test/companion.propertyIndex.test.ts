import * as assert from 'assert';
import { buildPropertyIndex, buildPropertyKey } from '../shared/companion/propertyIndex';

suite('Companion Property Index Test Suite', () => {
    test('buildPropertyIndex indexes nested property pointers', () => {
        const schemaDocuments = new Map<string, unknown>([
            [
                'Example.json',
                {
                    type: 'object',
                    properties: {
                        RootValue: {
                            type: 'string'
                        },
                        Nested: {
                            type: 'object',
                            properties: {
                                Child: {
                                    type: 'number',
                                    hytaleDevtools: {
                                        semanticKind: 'literalChoice'
                                    }
                                }
                            }
                        }
                    }
                }
            ]
        ]);

        const index = buildPropertyIndex(schemaDocuments);
        const nestedPointer = '/properties/Nested/properties/Child';
        const nestedKey = buildPropertyKey('Example.json', nestedPointer);

        assert.strictEqual(index.has(buildPropertyKey('Example.json', '/properties/RootValue')), true);
        assert.strictEqual(index.has(nestedKey), true);

        const nested = index.get(nestedKey);
        assert.ok(nested);
        assert.strictEqual(nested?.propertyName, 'Child');
        assert.deepStrictEqual(nested?.hytaleDevtools, { semanticKind: 'literalChoice' });
    });

    test('buildPropertyKey uses schema file and pointer', () => {
        assert.strictEqual(
            buildPropertyKey('common.json', '/definitions/Foo/properties/Bar'),
            'common.json#/definitions/Foo/properties/Bar'
        );
    });
});
