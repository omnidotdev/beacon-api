import { cors } from "@elysiajs/cors";
import { yoga } from "@elysiajs/graphql-yoga";
import { useDisableIntrospection } from "@graphql-yoga/plugin-disable-introspection";
import { registerSchemas } from "@omnidotdev/providers";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";

import { env, validateEnv } from "./lib/config/env";
import { createContext } from "./lib/graphql/context";
import { schema } from "./lib/graphql/schema";

const isProd = env.nodeEnv === "production";

// Validate environment on startup
if (isProd) {
  validateEnv();
}

// Register event schemas with Vortex
if (env.vortexApiUrl && env.vortexApiKey) {
  registerSchemas(env.vortexApiUrl, env.vortexApiKey, [
    {
      name: "beacon.conversation.started",
      source: "omni.beacon",
      description: "Conversation started",
    },
    {
      name: "beacon.conversation.ended",
      source: "omni.beacon",
      description: "Conversation ended",
    },
    {
      name: "beacon.tool.executed",
      source: "omni.beacon",
      description: "Tool executed during conversation",
    },
    {
      name: "beacon.message.received",
      source: "omni.beacon",
      description: "Message received from user",
    },
    {
      name: "beacon.message.processed",
      source: "omni.beacon",
      description: "Message processed by AI",
    },
    {
      name: "beacon.wake_word.detected",
      source: "omni.beacon",
      description: "Wake word detected in voice input",
    },
  ]).catch((err) => {
    console.warn("[Events] Schema registration failed:", err);
  });
}

const app = new Elysia()
  // Security headers
  .onAfterHandle(({ set }) => {
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["X-XSS-Protection"] = "1; mode=block";
    set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
  })
  .use(
    cors({
      origin: isProd
        ? ["https://beacon.omni.dev", "https://api.beacon.omni.dev"]
        : true,
      credentials: true,
      methods: ["GET", "POST"],
    }),
  )
  // Rate limiting
  .use(
    rateLimit({
      max: 100,
      duration: 60_000,
    }),
  )
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .get("/ready", async () => {
    // TODO: Check database connection
    return { status: "ready", timestamp: new Date().toISOString() };
  })
  .use(
    yoga({
      // biome-ignore lint/suspicious/noExplicitAny: yoga plugin schema/context type mismatch
      schema: schema as any,
      context: ({ request }: { request: Request }) => createContext(request),
      graphiql: !isProd,
      landingPage: false,
      plugins: [
        // Disable GraphQL introspection in production
        isProd && useDisableIntrospection(),
      ],
    }),
  )
  .listen(env.port);

console.log(
  `🦊 beacon-api Elysia server running at ${app.server?.url.toString().slice(0, -1)}`,
);

console.log(
  `🧘 beacon-api GraphQL Yoga API running at ${app.server?.url}graphql`,
);

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`[Server] Received ${signal}, shutting down...`);
  app.stop();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export type App = typeof app;
