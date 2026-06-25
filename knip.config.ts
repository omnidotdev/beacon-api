import type { KnipConfig } from "knip";

/**
 * Knip configuration.
 * @see https://knip.dev/overview/configuration
 */
const knipConfig: KnipConfig = {
  entry: ["src/server.ts", "src/scripts/**/*.ts", "src/**/*.test.ts"],
  project: ["src/**/*.ts"],
  ignore: ["src/lib/config/drizzle.config.ts"],
  ignoreDependencies: ["drizzle-kit"],
  // Honor `@knipignore` JSDoc tags on intentionally-retained exports
  // (boot-time providers, public auth types) with no in-repo importer
  tags: ["-knipignore"],
};

export default knipConfig;
