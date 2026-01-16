import * as assert from 'assert';
import { toCamelCase, toKebabCase, replaceTokens } from '../utils/stringUtils';

suite('String Utils Test Suite', () => {

    test('toCamelCase', () => {
        assert.strictEqual(toCamelCase('Foo Bar'), 'fooBar');
        assert.strictEqual(toCamelCase('foo-bar'), 'fooBar');
        assert.strictEqual(toCamelCase('foo_bar'), 'fooBar');
        assert.strictEqual(toCamelCase('FooBar'), 'fooBar');
    });

    test('toKebabCase', () => {
        assert.strictEqual(toKebabCase('Foo Bar'), 'foo-bar');
        assert.strictEqual(toKebabCase('fooBar'), 'foo-bar');
        assert.strictEqual(toKebabCase('FooBar'), 'foo-bar');
        assert.strictEqual(toKebabCase('foo_bar'), 'foo-bar');
    });

    test('replaceTokens', () => {
        const template = 'Hello {{NAME}}, welcome to {{PLACE}}';
        const replacements = {
            '{{NAME}}': 'World',
            '{{PLACE}}': 'Hytale'
        };
        const expected = 'Hello World, welcome to Hytale';
        assert.strictEqual(replaceTokens(template, replacements), expected);
    });
});
