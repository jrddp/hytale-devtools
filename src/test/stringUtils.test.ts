import * as assert from 'assert';
import { toCamelCase, toKebabCase, toPascalCase, toSquashedCase, replaceTokens } from '../utils/stringUtils';

suite('String Utils Test Suite', () => {

    test('toCamelCase', () => {
        assert.strictEqual(toCamelCase('Foo Bar'), 'fooBar');
        assert.strictEqual(toCamelCase('foo-bar'), 'fooBar');
        assert.strictEqual(toCamelCase('foo_bar'), 'fooBar');
        assert.strictEqual(toCamelCase('FooBar'), 'fooBar');
    });

    test('toSquashedCase', () => {
        assert.strictEqual(toSquashedCase('Hello World'), 'helloworld');
        assert.strictEqual(toSquashedCase('Super Sword'), 'supersword');
        assert.strictEqual(toSquashedCase('My-Mod'), 'mymod');
        assert.strictEqual(toSquashedCase('  Fancy   Mod  '), 'fancymod');
    });

    test('toKebabCase', () => {
        assert.strictEqual(toKebabCase('Foo Bar'), 'foo-bar');
        assert.strictEqual(toKebabCase('fooBar'), 'foo-bar');
        assert.strictEqual(toKebabCase('FooBar'), 'foo-bar');
        assert.strictEqual(toKebabCase('foo_bar'), 'foo-bar');
    });

    test('toPascalCase', () => {
        assert.strictEqual(toPascalCase('Foo Bar'), 'FooBar');
        assert.strictEqual(toPascalCase('foo-bar'), 'FooBar');
        assert.strictEqual(toPascalCase('foo_bar'), 'FooBar');
        assert.strictEqual(toPascalCase('fooBar'), 'FooBar');
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
