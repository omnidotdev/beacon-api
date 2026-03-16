/**
 * Shared provider instances for Beacon.
 */

import { createEventsProvider } from "@omnidotdev/providers/events";
import { createFlagProvider } from "@omnidotdev/providers/flags";

import { env } from "../config/env";

export const events = createEventsProvider(
  env.vortexApiUrl && env.vortexApiKey
    ? {
        provider: "http",
        baseUrl: env.vortexApiUrl,
        apiKey: env.vortexApiKey,
        source: "omni.beacon",
      }
    : {},
);

export const flags = createFlagProvider(
  env.flagsApiHost
    ? {
        provider: "unleash",
        url: env.flagsApiHost,
        apiKey: env.flagsClientKey!,
        appName: "beacon-api",
      }
    : {},
);
