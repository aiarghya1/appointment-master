import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    include: ["src/**/*.test.ts"],
    // PGlite boots a WASM Postgres per suite; give it room on a cold start.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
