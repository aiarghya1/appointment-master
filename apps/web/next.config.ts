import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    immutableStaticFiles: false,
  },
  // Next's own dev badge sits bottom-left, where our settings control lives.
  // It never ships to production anyway; hiding it keeps dev and prod honest
  // about what the corner actually contains. Compile and runtime errors are
  // still surfaced.
  devIndicators: false,
  // Workspace packages ship TypeScript source rather than a build artefact,
  // so Next compiles them alongside the app.
  transpilePackages: ["@appointment-master/availability", "@appointment-master/db"],
  // PGlite loads a WASM binary at runtime and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Next blocks cross-origin requests to dev-only assets by default. Tunnelling
  // the dev server (to demo it, or to test on a phone) serves it from a host it
  // was not started with, so those hosts have to be named. Development only —
  // this has no effect on a production build.
  allowedDevOrigins: ["*.lhr.life", "*.trycloudflare.com", "*.ngrok-free.app"],
};

export default nextConfig;
