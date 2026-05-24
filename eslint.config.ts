import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "quotes": ["error", "double"]
    }
  },
  {
    ignores: ["dist/", "old/"]
  }
);
