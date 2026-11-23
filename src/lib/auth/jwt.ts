import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env";

// JWKS for verifying tokens from HIDRA
const jwks = createRemoteJWKSet(new URL(`${env.authBaseUrl}/jwks`));

/**
 * Token checks beyond the signature: issued by our identity service, for
 * Beacon. Without the audience, a token minted for any other Omni product
 * would be accepted
 */
export const verifyOptions = () => ({
  issuer: env.authBaseUrl,
  audience: env.authAudience,
});

/** @knipignore */
export interface TokenPayload {
  sub: string; // User identity provider ID
  email?: string;
  name?: string;
  picture?: string;
  iat: number;
  exp: number;
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, verifyOptions());

    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
