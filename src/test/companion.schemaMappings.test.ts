import * as assert from 'assert';
import {
    globToRegExp,
    matchSchemaFileForAssetPath,
    normalizeSchemaUrlToSchemaFileName,
    parseSchemaMappingRules
} from '../shared/companion/schemaMappings';
import { type CompanionSchemaMappingsDocument } from '../shared/companion/types';

suite('Companion Schema Mappings Test Suite', () => {
    test('normalizeSchemaUrlToSchemaFileName uses basename', () => {
        assert.strictEqual(normalizeSchemaUrlToSchemaFileName('./Schema/AmbienceFX.json'), 'AmbienceFX.json');
        assert.strictEqual(normalizeSchemaUrlToSchemaFileName('./schemas/BlockType.json'), 'BlockType.json');
    });

    test('globToRegExp supports single and double wildcard segments', () => {
        const single = globToRegExp('/Server/Item/*.json');
        const recursive = globToRegExp('/Server/Item/**/*.json');

        assert.strictEqual(single.test('/Server/Item/Foo.json'), true);
        assert.strictEqual(single.test('/Server/Item/Nested/Foo.json'), false);
        assert.strictEqual(recursive.test('/Server/Item/Nested/Foo.json'), true);
    });

    test('parseSchemaMappingRules and first-match-wins behavior', () => {
        const document: CompanionSchemaMappingsDocument = {
            schemaMappings: {
                'json.schemas': [
                    {
                        fileMatch: ['/Server/Item/**/*.json'],
                        url: './Schema/First.json'
                    },
                    {
                        fileMatch: ['/Server/Item/**/*.json'],
                        url: './Schema/Second.json'
                    }
                ]
            }
        };

        const rules = parseSchemaMappingRules(document);
        assert.strictEqual(rules.length, 2);

        const resolved = matchSchemaFileForAssetPath('/Server/Item/Foo/Bar.json', rules);
        assert.strictEqual(resolved, 'First.json');
    });

    test('matching is case-sensitive', () => {
        const document: CompanionSchemaMappingsDocument = {
            schemaMappings: {
                'json.schemas': [
                    {
                        fileMatch: ['/Server/Item/**/*.json'],
                        url: './Schema/Item.json'
                    }
                ]
            }
        };

        const rules = parseSchemaMappingRules(document);
        assert.strictEqual(matchSchemaFileForAssetPath('/Server/Item/Foo.json', rules), 'Item.json');
        assert.strictEqual(matchSchemaFileForAssetPath('/server/item/Foo.json', rules), undefined);
    });
});
