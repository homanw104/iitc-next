import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      "comma-dangle": ["error", {
        arrays: "always-multiline",
        objects: "always-multiline",
        imports: "always-multiline",
        exports: "always-multiline",
        functions: "always-multiline",
      }],
      "semi": ["error", "always"],
      "quotes": ["error", "double", { "allowTemplateLiterals": true }],
      "@typescript-eslint/no-namespace": ["error", { "allowDeclarations": true }],
    },
  },
  {
    ignores: ["dist/", "old/", "android/", "ios/"],
  },
);
