import { eq } from "drizzle-orm";
import { extractBearerToken, verifyToken } from "../auth/jwt";
import { db, users } from "../db";

export interface GraphQLContext {
  observer: {
    id: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    identityProviderId: string;
  } | null;
}

export async function createContext(request: Request): Promise<GraphQLContext> {
  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return { observer: null };
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return { observer: null };
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
  };
}
