import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build artefact,
  // so Next compiles them alongside the app.
  transpilePackages: ["@appointment-master/availability", "@appointment-master/db"],
  // PGlite loads a WASM binary at runtime and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
