import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "availability",
    include: ["src/**/*.test.ts"],
    // The engine must never read the ambient clock or zone. Pinning the process
    // zone to something exotic makes any accidental dependency on it fail loudly.
    env: { TZ: "Pacific/Chatham" },
  },
});
