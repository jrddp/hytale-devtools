import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import sveltePlugin from "eslint-plugin-svelte";

const consistentTypeImportsRule = [
  "warn",
  {
    prefer: "type-imports",
    disallowTypeAnnotations: false,
    fixStyle: "inline-type-imports",
  },
];

export default [
  {
    ignores: ["out/**", "dist/**", "**/*.d.ts"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],
      "curly": "warn",
      "eqeqeq": "warn",
      "no-throw-literal": "warn",
      "semi": "off",
      "@typescript-eslint/consistent-type-imports": consistentTypeImportsRule,
    },
  },
  ...sveltePlugin.configs["flat/base"],
  {
    files: ["webview/**/*.svelte", "webview/**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".svelte"],
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": consistentTypeImportsRule,
    },
  },
];
