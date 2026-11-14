import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guard: Beacon's AI spend is metered and charged by the Synapse gateway
 * against the pooled Aether credit balance. The API must never grow a local
 * credit ledger, a markup multiplier, or a per-model rate table again
 */

const SRC_ROOT = join(import.meta.dir, "../..");

// Generated migrations keep the historical DDL for the dropped table
const SKIP_DIRS = new Set(["generated", "node_modules"]);

const SELF = relative(SRC_ROOT, import.meta.path);

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: "local credit balance column", pattern: /credits_?remaining/i },
  { label: "local credit markup math", pattern: /creditsFromCostCents/ },
  { label: "markup constant", pattern: /COGS_MARKUP|CREDIT_MARKUP/ },
  { label: "per-model price table", pattern: /per_?million/i },
];

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      return SKIP_DIRS.has(entry) ? [] : listSourceFiles(path);
    }

    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });

describe("no local credit ledger", () => {
  const files = listSourceFiles(SRC_ROOT).filter(
    (file) => relative(SRC_ROOT, file) !== SELF,
  );

  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { label, pattern } of FORBIDDEN) {
    it(`has no ${label}`, () => {
      const offenders = files.filter((file) =>
        pattern.test(readFileSync(file, "utf8")),
      );

      expect(offenders.map((file) => relative(SRC_ROOT, file))).toEqual([]);
    });
  }

  it("does not define a local subscriptions table", () => {
    const schema = readFileSync(join(SRC_ROOT, "lib/db/schema.ts"), "utf8");

    expect(schema).not.toMatch(/pgTable\(\s*"subscriptions"/);
  });
});
