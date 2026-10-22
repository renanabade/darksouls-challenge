import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

const source = (pkg: string) =>
  fileURLToPath(new URL(`packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  // NestJS needs legacy decorators with emitted parameter types, which only SWC emits in Vitest.
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  resolve: {
    // Tests run against the packages' sources, so CI does not need a build first.
    alias: {
      "@darksouls-challenge/core": source("core"),
      "@darksouls-challenge/contracts": source("contracts"),
      "@darksouls-challenge/db": source("db"),
      "@darksouls-challenge/messaging": source("messaging"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/*/src/**"],
    },
  },
});
