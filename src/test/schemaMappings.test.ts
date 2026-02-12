import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    buildManagedSchemaAssociations,
    detectSchemaDirectoryName,
    mergeJsonSchemaAssociations,
    toWorkspaceFileMatchPatterns
} from '../schema/schemaMappings';

suite('Schema Mapping Test Suite', () => {

    test('toWorkspaceFileMatchPatterns maps schema fileMatch entries into resources globs', () => {
        const fileMatchPatterns = toWorkspaceFileMatchPatterns([
            '/Server/Audio/AmbienceFX/*.json',
            '/Server/Audio/AmbienceFX/**/*.json'
        ]);

        assert.deepStrictEqual(fileMatchPatterns, [
            '**/src/main/resources/Server/Audio/AmbienceFX/*.json',
            '**/src/main/resources/Server/Audio/AmbienceFX/**/*.json'
        ]);
    });

    test('buildManagedSchemaAssociations resolves Schema URLs to Schemas directory when needed', () => {
        const schemaRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-schema-'));

        try {
            const schemasDirectoryPath = path.join(schemaRootPath, 'Schemas');
            fs.mkdirSync(schemasDirectoryPath, { recursive: true });
            fs.writeFileSync(path.join(schemasDirectoryPath, 'BlockType.json'), '{}', 'utf8');

            assert.strictEqual(detectSchemaDirectoryName(schemaRootPath), 'Schemas');

            const associations = buildManagedSchemaAssociations({
                rawMappings: {
                    'json.schemas': [
                        {
                            fileMatch: [
                                '/Server/Item/Block/Blocks/*.json',
                                '/Server/Item/Block/Blocks/**/*.json'
                            ],
                            url: './Schema/BlockType.json'
                        },
                        {
                            fileMatch: ['/Server/Item/Block/Unknown/*.json'],
                            url: './Schema/Unknown.json'
                        }
                    ]
                },
                schemaRootPath
            });

            assert.strictEqual(associations.length, 1);
            assert.deepStrictEqual(associations[0].fileMatch, [
                '**/src/main/resources/Server/Item/Block/Blocks/*.json',
                '**/src/main/resources/Server/Item/Block/Blocks/**/*.json'
            ]);
            assert.strictEqual(path.basename(associations[0].schemaFilePath), 'BlockType.json');
            assert.ok(associations[0].schemaFilePath.includes(`${path.sep}Schemas${path.sep}`));
        } finally {
            fs.rmSync(schemaRootPath, { recursive: true, force: true });
        }
    });

    test('mergeJsonSchemaAssociations preserves user entries and replaces managed URLs', () => {
        const existingSchemas = [
            { fileMatch: ['**/src/main/resources/Server/A.json'], url: 'file:///managed-old-A.json' },
            { fileMatch: ['**/src/main/resources/Server/B.json'], url: 'file:///managed-old-B.json' },
            { fileMatch: ['**/src/main/resources/custom.json'], url: 'file:///user-schema.json' },
            { label: 'user-custom-entry-without-url' }
        ];

        const mergedSchemas = mergeJsonSchemaAssociations({
            existingSchemas,
            managedSchemas: [
                { fileMatch: ['**/src/main/resources/Server/C.json'], url: 'file:///managed-new-C.json' },
                { fileMatch: ['**/src/main/resources/Server/C.json'], url: 'file:///managed-new-C.json' }
            ],
            previousManagedUrls: [
                'file:///managed-old-A.json',
                'file:///managed-old-B.json'
            ]
        });

        assert.deepStrictEqual(mergedSchemas, [
            { fileMatch: ['**/src/main/resources/custom.json'], url: 'file:///user-schema.json' },
            { label: 'user-custom-entry-without-url' },
            { fileMatch: ['**/src/main/resources/Server/C.json'], url: 'file:///managed-new-C.json' }
        ]);
    });
});
