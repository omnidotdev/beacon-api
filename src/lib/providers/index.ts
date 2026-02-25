/**
 * Shared provider instances for Beacon.
 */

import { createEventsProvider } from "@omnidotdev/providers";

import { env } from "../config/env";

export const events = createEventsProvider(
  env.vortexApiUrl
    ? {
        provider: "http",
        baseUrl: env.vortexApiUrl,
        apiKey: env.vortexApiKey,
        source: "omni.beacon",
      }
    : {},
);
