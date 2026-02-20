import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createIndexShardMapKey, loadIndexShardsFromDirectory } from '../shared/companion/indexStore';

suite('Companion Index Store Test Suite', () => {
    test('loadIndexShardsFromDirectory scans nested folders and builds keyed map', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hytale-index-store-'));
        const indexRoot = path.join(tempRoot, 'indexes');
        fs.mkdirSync(path.join(indexRoot, 'registeredAssets'), { recursive: true });
        fs.mkdirSync(path.join(indexRoot, 'referenceBundle'), { recursive: true });

        fs.writeFileSync(
            path.join(indexRoot, 'registeredAssets', 'BlockType.json'),
            JSON.stringify({
                indexKind: 'registeredAssets',
                key: 'BlockType',
                values: { Stone: { sourcedFromFile: 'Server/Blocks/Stone.json' } }
            }),
            'utf8'
        );
        fs.writeFileSync(
            path.join(indexRoot, 'referenceBundle', 'DecimalConstants.json'),
            JSON.stringify({
                indexKind: 'referenceBundle',
                key: 'DecimalConstants',
                values: ['A', 'B']
            }),
            'utf8'
        );

        const shards = await loadIndexShardsFromDirectory(indexRoot);
        const blockTypeKey = createIndexShardMapKey('registeredAssets', 'BlockType');
        const decimalKey = createIndexShardMapKey('referenceBundle', 'DecimalConstants');

        assert.strictEqual(shards.size, 2);
        assert.strictEqual(shards.has(blockTypeKey), true);
        assert.strictEqual(shards.has(decimalKey), true);
        assert.deepStrictEqual(shards.get(decimalKey)?.values, ['A', 'B']);
    });
});
