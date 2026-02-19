// Environment configuration

export const env = {
  // Server
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database
  databaseUrl: process.env.DATABASE_URL!,

  // Auth
  authBaseUrl: process.env.AUTH_BASE_URL || "https://identity.omni.dev",
  authSecret: process.env.AUTH_SECRET!,

  // Gateway
  gatewayUrl: process.env.GATEWAY_URL || "http://localhost:18790",
  gatewaySecret: process.env.GATEWAY_SECRET!,

  // Billing
  aetherApiUrl: process.env.AETHER_API_URL,
  aetherApiKey: process.env.AETHER_API_KEY,

  // Feature flags
  flagsApiHost: process.env.FLAGS_API_HOST,
  flagsClientKey: process.env.FLAGS_CLIENT_KEY,
} as const;

// Re-export for flag client compatibility
export const FLAGS_API_HOST = env.flagsApiHost;
export const FLAGS_CLIENT_KEY = env.flagsClientKey;

export function validateEnv() {
  const required = [
    "DATABASE_URL",
    "AUTH_SECRET",
    "GATEWAY_SECRET",
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
