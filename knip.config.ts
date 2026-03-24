import type { KnipConfig } from "knip";

/**
 * Knip configuration.
 * @see https://knip.dev/overview/configuration
 */
const knipConfig: KnipConfig = {
  entry: ["src/server.ts", "src/scripts/**/*.ts"],
  project: ["src/**/*.ts"],
  ignore: ["src/lib/config/drizzle.config.ts"],
  ignoreDependencies: ["drizzle-kit"],
};

export default knipConfig;
