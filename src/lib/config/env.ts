// Environment configuration
// NB: destructured access prevents Bun's bundler from inlining values at build time
const {
  NODE_ENV,
  PORT,
  DATABASE_URL,
  AUTH_BASE_URL,
  AUTH_SECRET,
  GATEWAY_URL,
  GATEWAY_SECRET,
  AETHER_API_URL,
  AETHER_API_KEY,
  FLAGS_API_HOST,
  FLAGS_CLIENT_KEY,
  VORTEX_API_URL,
  VORTEX_API_KEY,
} = process.env;

export const env = {
  // Server
  port: Number(PORT) || 4000,
  nodeEnv: NODE_ENV || "development",

  // Database
  databaseUrl: DATABASE_URL ?? "",

  // Auth
  authBaseUrl: AUTH_BASE_URL || "https://identity.omni.dev",
  authSecret: AUTH_SECRET ?? "",

  // Gateway
  gatewayUrl: GATEWAY_URL || "http://localhost:18790",
  gatewaySecret: GATEWAY_SECRET ?? "",

  // Billing
  aetherApiUrl: AETHER_API_URL,
  aetherApiKey: AETHER_API_KEY,

  // Feature flags
  flagsApiHost: FLAGS_API_HOST,
  flagsClientKey: FLAGS_CLIENT_KEY,

  // Vortex (event streaming)
  vortexApiUrl: VORTEX_API_URL,
  vortexApiKey: VORTEX_API_KEY,
} as const;

export function validateEnv() {
  const required = ["DATABASE_URL", "AUTH_SECRET", "GATEWAY_SECRET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
