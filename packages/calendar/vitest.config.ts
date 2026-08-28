import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "calendar",
    include: ["src/**/*.test.ts"],
    // Invitations are built entirely in UTC. Pinning an exotic zone means any
    // accidental use of local time shows up as a failure rather than a bug
    // that only appears for attendees in other zones.
    env: { TZ: "Pacific/Chatham" },
  },
});
