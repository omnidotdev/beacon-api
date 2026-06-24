import { eq } from "drizzle-orm";
import { createWithPgClient } from "postgraphile/adaptors/pg";
import { extractBearerToken, verifyToken } from "../auth/jwt";
import { db, pgPool, users } from "../db";

export interface Observer {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  identityProviderId: string;
}

interface GraphQLContext {
  observer: Observer | null;
  /** Drizzle client, read by custom Grafast plans via `context().get("db")`. */
  db: typeof db;
  /** Postgres client factory required by Postgraphile's pg plans. */
  withPgClient: ReturnType<typeof createWithPgClient>;
}

// Grafast context augmentation (read within plan resolvers).
// See https://grafast.org/grafast/step-library/standard-steps/context
declare global {
  namespace Grafast {
    interface Context {
      observer: Observer | null;
      db: typeof db;
    }
  }
}

const withPgClient = createWithPgClient({ pool: pgPool });

export async function createContext(request: Request): Promise<GraphQLContext> {
  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return { observer: null, db, withPgClient };
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return { observer: null, db, withPgClient };
  }

  // Find or create user
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.identityProviderId, payload.sub));

  if (!user) {
    // Auto-create user on first login
    [user] = await db
      .insert(users)
      .values({
        identityProviderId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.picture,
      })
      .returning();
  }

  return {
    observer: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
      identityProviderId: payload.sub,
    },
    db,
    withPgClient,
  };
}
