import { describe, expect, it } from "bun:test";

import { generateKeyPair, jwtVerify, SignJWT } from "jose";

import { extractBearerToken, verifyOptions } from "./jwt";

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Bearer header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("returns null when the header is missing", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it("returns null for a non-Bearer scheme", () => {
    expect(extractBearerToken("Basic abc.def.ghi")).toBeNull();
  });

  it("is case-sensitive on the scheme", () => {
    expect(extractBearerToken("bearer abc")).toBeNull();
  });

  it("returns an empty string when the scheme has no token", () => {
    // "Bearer " with nothing after it slices to ""; downstream verification rejects it
    expect(extractBearerToken("Bearer ")).toBe("");
  });

  it("preserves tokens containing spaces after the scheme", () => {
    expect(extractBearerToken("Bearer a b c")).toBe("a b c");
  });
});

describe("verifyOptions", () => {
  const sign = async (iss: string, aud: string) => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(iss)
      .setAudience(aud)
      .setExpirationTime("10m")
      .sign(privateKey);
    return { token, publicKey };
  };

  const accepts = async (iss: string, aud: string) => {
    const { token, publicKey } = await sign(iss, aud);
    return jwtVerify(token, publicKey, verifyOptions()).then(
      () => true,
      () => false,
    );
  };

  it("accepts Beacon tokens from the identity service", async () => {
    expect(
      await accepts(
        "https://identity.omni.dev",
        "https://gateway.beacon.omni.dev",
      ),
    ).toBe(true);
  });

  it("rejects tokens minted for another product", async () => {
    expect(
      await accepts(
        "https://identity.omni.dev",
        "https://api.keystone.omni.dev",
      ),
    ).toBe(false);
  });

  it("rejects tokens from another issuer", async () => {
    expect(
      await accepts("https://evil.example", "https://gateway.beacon.omni.dev"),
    ).toBe(false);
  });
});
