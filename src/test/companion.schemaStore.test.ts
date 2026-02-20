import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadRawSchemasFromDirectory, loadResolvedSchemasFromDirectory, resolveJsonPointer } from '../shared/companion/schemaStore';

suite('Companion Schema Store Test Suite', () => {
    test('loadRawSchemasFromDirectory reads all schema files', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-schema-store-raw-'));
        fs.writeFileSync(path.join(tempRoot, 'A.json'), JSON.stringify({ type: 'object' }), 'utf8');
        fs.writeFileSync(path.join(tempRoot, 'B.json'), JSON.stringify({ type: 'string' }), 'utf8');

        const schemas = await loadRawSchemasFromDirectory(tempRoot);
        assert.strictEqual(schemas.size, 2);
        assert.deepStrictEqual(schemas.get('A.json'), { type: 'object' });
        assert.deepStrictEqual(schemas.get('B.json'), { type: 'string' });
    });

    test('loadResolvedSchemasFromDirectory dereferences local cross-file refs', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-schema-store-resolved-'));
        fs.writeFileSync(
            path.join(tempRoot, 'common.json'),
            JSON.stringify({
                definitions: {
                    NameType: {
                        type: 'string'
                    }
                }
            }),
            'utf8'
        );
        fs.writeFileSync(
            path.join(tempRoot, 'Foo.json'),
            JSON.stringify({
                type: 'object',
                properties: {
                    Name: {
                        $ref: 'common.json#/definitions/NameType'
                    }
                }
            }),
            'utf8'
        );

        const schemas = await loadResolvedSchemasFromDirectory(tempRoot);
        const foo = schemas.get('Foo.json');
        assert.ok(foo);
        assert.deepStrictEqual(resolveJsonPointer(foo, '/properties/Name/type'), 'string');
    });
});
