// @ts-check
import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/dist/",
      "**/coverage/",
      "data/",
      "packages/db/src/generated/",
      "apps/web/.next/",
      "apps/web/out/",
      "**/next-env.d.ts",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["*.js", "apps/web/scripts/*.js"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The web app's own check config reads the core's sources (see apps/web/tsconfig.check.json).
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["apps/web/tsconfig.check.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // NestJS modules are empty classes carrying a decorator.
    files: ["apps/**/*.ts"],
    rules: { "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }] },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
