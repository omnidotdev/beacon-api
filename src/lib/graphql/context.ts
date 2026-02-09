import { eq } from "drizzle-orm";
import { extractBearerToken, verifyToken } from "../auth/jwt";
import { db, users } from "../db";

export interface GraphQLContext {
  userId: string | null;
  identityProviderId: string | null;
}

export async function createContext(request: Request): Promise<GraphQLContext> {
  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return { userId: null, identityProviderId: null };
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return { userId: null, identityProviderId: null };
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
    userId: user.id,
    identityProviderId: payload.sub,
  };
}
