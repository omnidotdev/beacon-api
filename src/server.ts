import { cors } from "@elysiajs/cors";
import { yoga } from "@elysiajs/graphql-yoga";
import { useDisableIntrospection } from "@graphql-yoga/plugin-disable-introspection";
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
      schema,
      context: ({ request }) => createContext(request),
      graphiql: !isProd,
      landingPage: false,
      plugins: [
        // Disable GraphQL introspection in production
        isProd && useDisableIntrospection(),
      ],
    }),
  )
  .listen(env.port);

// biome-ignore lint/suspicious/noConsole: startup logging
console.log(
  `🦊 beacon-api Elysia server running at ${app.server?.url.toString().slice(0, -1)}`,
);

// biome-ignore lint/suspicious/noConsole: startup logging
console.log(`🧘 beacon-api GraphQL Yoga API running at ${app.server?.url}graphql`);

// Graceful shutdown
const shutdown = (signal: string) => {
  // biome-ignore lint/suspicious/noConsole: shutdown logging
  console.log(`[Server] Received ${signal}, shutting down...`);
  app.stop();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export type App = typeof app;
