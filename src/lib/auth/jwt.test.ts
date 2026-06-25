import { describe, expect, it } from "bun:test";

import { extractBearerToken } from "./jwt";

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
