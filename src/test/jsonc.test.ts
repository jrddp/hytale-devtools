import * as assert from 'assert';
import { parseJsonc } from '../utils/jsonc';

suite('JSONC Utils Test Suite', () => {

    test('parseJsonc parses trailing commas', () => {
        const parsed = parseJsonc('{"a": 1, "b": [1,2,],}') as Record<string, unknown>;
        assert.strictEqual(parsed.a, 1);
        assert.deepStrictEqual(parsed.b, [1, 2]);
    });

    test('parseJsonc parses line and block comments', () => {
        const parsed = parseJsonc('{/*x*/"a":1,// y\n"b":2}') as Record<string, unknown>;
        assert.strictEqual(parsed.a, 1);
        assert.strictEqual(parsed.b, 2);
    });
});
