import { and, eq, gte, isNull } from "drizzle-orm";
import type { FieldArgs, Step } from "postgraphile/grafast";
import { context, lambda, object } from "postgraphile/grafast";
import { extendSchema, gql } from "postgraphile/utils";
import { computeContentHash } from "../../crypto/hash";
import {
  type Memory,
  memories,
  subscriptions,
  syncCursors,
  userPreferences,
} from "../../db";
import { events } from "../../providers";
import type { Observer } from "../context";

const SYNC_PAGE_SIZE = 100;

type Db = Grafast.Context["db"];

interface PushMemoryInput {
  gatewayMemoryId: string;
  category: string;
  content: string;
  tags?: string;
  pinned?: boolean;
  accessCount?: number;
  sourceSessionId?: string;
  sourceChannel?: string;
  originDeviceId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Read the current observer + db from the Grafast context as one object step. */
const ctx = () =>
  object({ observer: context().get("observer"), db: context().get("db") });

/**
 * Beacon's curated, sync-oriented GraphQL surface, ported from the previous
 * hand-written graphql-yoga schema onto the Postgraphile/Grafast runtime.
 * Custom logic (LWW merge, content-hash dedup, sync cursors, the observer
 * viewer pattern) runs inside `lambda` plan steps that call Drizzle directly.
 */
const BeaconPlugin = extendSchema({
  typeDefs: gql`
    type Observer {
      id: ID!
      email: String
      name: String
      avatarUrl: String
      subscription: BillingSubscription
      preferences: UserPreferences
      memories(category: String, limit: Int): [Memory!]!
      memoriesSince(since: String!, deviceId: String!): MemorySyncPayload!
    }

    type BillingSubscription {
      id: ID!
      plan: Plan!
      status: SubscriptionStatus!
      creditsRemaining: Int
    }

    enum Plan {
      FREE
      PRO
      TEAM
    }

    enum SubscriptionStatus {
      ACTIVE
      CANCELED
      PAST_DUE
    }

    type UserPreferences {
      id: ID!
      defaultPersona: String!
      theme: String!
      voiceEnabled: Boolean!
    }

    input UpdatePreferencesInput {
      defaultPersona: String
      theme: String
      voiceEnabled: Boolean
    }

    type GatewaySession {
      sessionId: String!
      websocketUrl: String!
      expiresAt: String!
    }

    type Memory {
      id: ID!
      gatewayMemoryId: String!
      category: String!
      content: String!
      contentHash: String!
      tags: String!
      pinned: Boolean!
      accessCount: Int!
      sourceSessionId: String
      sourceChannel: String
      originDeviceId: String
      createdAt: String!
      updatedAt: String!
      deletedAt: String
    }

    type MemorySyncPayload {
      memories: [Memory!]!
      cursor: String!
      hasMore: Boolean!
    }

    input PushMemoryInput {
      gatewayMemoryId: String!
      category: String!
      content: String!
      tags: String
      pinned: Boolean
      accessCount: Int
      sourceSessionId: String
      sourceChannel: String
      originDeviceId: String
      createdAt: String!
      updatedAt: String!
      deletedAt: String
    }

    type PushMemoriesResult {
      pushed: Int!
      updated: Int!
      duplicates: Int!
    }

    extend type Query {
      """
      The currently authenticated user. Returns null if not authenticated.
      """
      observer: Observer
    }

    extend type Mutation {
      updatePreferences(input: UpdatePreferencesInput!): UserPreferences!
      createGatewaySession: GatewaySession!
      pushMemories(input: [PushMemoryInput!]!): PushMemoriesResult!
      deleteMemory(gatewayMemoryId: String!): Boolean!
      updateMemory(gatewayMemoryId: String!, pinned: Boolean): Memory!
    }
  `,
  plans: {
    Query: {
      observer: () => context().get("observer"),
    },

    Observer: {
      subscription: ($observer: Step<Observer | null>) =>
        lambda(
          object({ observer: $observer, db: context().get("db") }),
          async ({ observer, db }: { observer: Observer | null; db: Db }) => {
            if (!observer) return null;
            const [sub] = await db
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.userId, observer.id));
            return sub ?? null;
          },
        ),

      preferences: ($observer: Step<Observer | null>) =>
        lambda(
          object({ observer: $observer, db: context().get("db") }),
          async ({ observer, db }: { observer: Observer | null; db: Db }) => {
            if (!observer) return null;
            const [prefs] = await db
              .select()
              .from(userPreferences)
              .where(eq(userPreferences.userId, observer.id));
            return prefs ?? null;
          },
        ),

      memories: ($observer: Step<Observer | null>, fieldArgs: FieldArgs) =>
        lambda(
          object({
            observer: $observer,
            db: context().get("db"),
            category: fieldArgs.getRaw("category"),
            limit: fieldArgs.getRaw("limit"),
          }),
          async ({
            observer,
            db,
            category,
            limit,
          }: {
            observer: Observer | null;
            db: Db;
            category?: string;
            limit?: number;
          }) => {
            if (!observer) return [];
            const conditions = [
              eq(memories.userId, observer.id),
              isNull(memories.deletedAt),
            ];
            if (category) conditions.push(eq(memories.category, category));

            const query = db
              .select()
              .from(memories)
              .where(and(...conditions))
              .orderBy(memories.updatedAt);

            if (limit && limit > 0) query.limit(limit);
            return query;
          },
        ),

      memoriesSince: ($observer: Step<Observer | null>, fieldArgs: FieldArgs) =>
        lambda(
          object({
            observer: $observer,
            db: context().get("db"),
            since: fieldArgs.getRaw("since"),
            deviceId: fieldArgs.getRaw("deviceId"),
          }),
          async ({
            observer,
            db,
            since,
            deviceId,
          }: {
            observer: Observer | null;
            db: Db;
            since: string;
            deviceId: string;
          }) => {
            if (!observer) {
              return { memories: [], cursor: since, hasMore: false };
            }
            const sinceDate = new Date(since);

            const results = await db
              .select()
              .from(memories)
              .where(
                and(
                  eq(memories.userId, observer.id),
                  gte(memories.updatedAt, sinceDate),
                ),
              )
              .orderBy(memories.updatedAt)
              .limit(SYNC_PAGE_SIZE + 1);

            const hasMore = results.length > SYNC_PAGE_SIZE;
            const page = hasMore ? results.slice(0, SYNC_PAGE_SIZE) : results;
            const cursor =
              page.length > 0
                ? page[page.length - 1].updatedAt.toISOString()
                : since;

            const [existingCursor] = await db
              .select()
              .from(syncCursors)
              .where(
                and(
                  eq(syncCursors.userId, observer.id),
                  eq(syncCursors.deviceId, deviceId),
                ),
              );

            if (existingCursor) {
              await db
                .update(syncCursors)
                .set({ lastSyncedAt: new Date() })
                .where(eq(syncCursors.id, existingCursor.id));
            } else {
              await db
                .insert(syncCursors)
                .values({ userId: observer.id, deviceId });
            }

            return { memories: page, cursor, hasMore };
          },
        ),
    },

    BillingSubscription: {
      plan: ($sub: Step<{ plan: string }>) =>
        lambda($sub, (sub) => sub.plan.toUpperCase()),
      status: ($sub: Step<{ status: string }>) =>
        lambda($sub, (sub) => sub.status.toUpperCase().replace("-", "_")),
    },

    Memory: {
      createdAt: ($mem: Step<Memory>) =>
        lambda($mem, (mem) => mem.createdAt.toISOString()),
      updatedAt: ($mem: Step<Memory>) =>
        lambda($mem, (mem) => mem.updatedAt.toISOString()),
      deletedAt: ($mem: Step<Memory>) =>
        lambda($mem, (mem) => mem.deletedAt?.toISOString() ?? null),
    },

    Mutation: {
      updatePreferences: (_$root: Step, fieldArgs: FieldArgs) =>
        lambda(
          object({
            observer: context().get("observer"),
            db: context().get("db"),
            input: fieldArgs.getRaw("input"),
          }),
          async ({
            observer,
            db,
            input,
          }: {
            observer: Observer | null;
            db: Db;
            input: {
              defaultPersona?: string;
              theme?: string;
              voiceEnabled?: boolean;
            };
          }) => {
            if (!observer) throw new Error("Unauthorized");
            const userId = observer.id;

            const [existing] = await db
              .select()
              .from(userPreferences)
              .where(eq(userPreferences.userId, userId));

            let result: typeof userPreferences.$inferSelect;
            if (existing) {
              [result] = await db
                .update(userPreferences)
                .set({ ...input, updatedAt: new Date() })
                .where(eq(userPreferences.id, existing.id))
                .returning();
            } else {
              [result] = await db
                .insert(userPreferences)
                .values({ userId, ...input })
                .returning();
            }

            events
              .emit({
                type: "beacon.preferences.updated",
                data: { userId, ...input },
                subject: userId,
              })
              .catch((err) => console.warn("[beacon] Event emit failed", err));

            return result;
          },
        ),

      createGatewaySession: (_$root: Step) =>
        lambda(ctx(), ({ observer }: { observer: Observer | null }) => {
          if (!observer) throw new Error("Unauthorized");
          const sessionId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
          return {
            sessionId,
            websocketUrl: `wss://gateway.beacon.omni.dev/ws/chat?session=${sessionId}`,
            expiresAt: expiresAt.toISOString(),
          };
        }),

      pushMemories: (_$root: Step, fieldArgs: FieldArgs) =>
        lambda(
          object({
            observer: context().get("observer"),
            db: context().get("db"),
            input: fieldArgs.getRaw("input"),
          }),
          async ({
            observer,
            db,
            input,
          }: {
            observer: Observer | null;
            db: Db;
            input: PushMemoryInput[];
          }) => {
            if (!observer) throw new Error("Unauthorized");
            const userId = observer.id;
            let pushed = 0;
            let updated = 0;
            let duplicates = 0;

            for (const item of input) {
              const contentHash = await computeContentHash(item.content);
              const [existing] = await db
                .select()
                .from(memories)
                .where(
                  and(
                    eq(memories.userId, userId),
                    eq(memories.contentHash, contentHash),
                  ),
                );

              if (existing) {
                const incomingUpdatedAt = new Date(item.updatedAt);
                if (incomingUpdatedAt > existing.updatedAt) {
                  await db
                    .update(memories)
                    .set({
                      gatewayMemoryId: item.gatewayMemoryId,
                      category: item.category,
                      content: item.content,
                      tags: item.tags ?? existing.tags,
                      pinned: item.pinned ?? existing.pinned,
                      accessCount: Math.max(
                        item.accessCount ?? 0,
                        existing.accessCount,
                      ),
                      sourceSessionId:
                        item.sourceSessionId ?? existing.sourceSessionId,
                      sourceChannel:
                        item.sourceChannel ?? existing.sourceChannel,
                      originDeviceId:
                        item.originDeviceId ?? existing.originDeviceId,
                      updatedAt: incomingUpdatedAt,
                      deletedAt: item.deletedAt
                        ? new Date(item.deletedAt)
                        : existing.deletedAt,
                    })
                    .where(eq(memories.id, existing.id));
                  updated++;
                } else {
                  const maxAccess = Math.max(
                    item.accessCount ?? 0,
                    existing.accessCount,
                  );
                  if (maxAccess > existing.accessCount) {
                    await db
                      .update(memories)
                      .set({ accessCount: maxAccess })
                      .where(eq(memories.id, existing.id));
                  }
                  duplicates++;
                }
              } else {
                await db.insert(memories).values({
                  gatewayMemoryId: item.gatewayMemoryId,
                  userId,
                  category: item.category,
                  content: item.content,
                  contentHash,
                  tags: item.tags ?? "[]",
                  pinned: item.pinned ?? false,
                  accessCount: item.accessCount ?? 0,
                  sourceSessionId: item.sourceSessionId,
                  sourceChannel: item.sourceChannel,
                  originDeviceId: item.originDeviceId,
                  createdAt: new Date(item.createdAt),
                  updatedAt: new Date(item.updatedAt),
                  deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
                });
                pushed++;
              }
            }

            events
              .emit({
                type: "beacon.memories.synced",
                data: { userId, pushed, updated, duplicates },
                subject: userId,
              })
              .catch((err) => console.warn("[beacon] Event emit failed", err));

            return { pushed, updated, duplicates };
          },
        ),

      deleteMemory: (_$root: Step, fieldArgs: FieldArgs) =>
        lambda(
          object({
            observer: context().get("observer"),
            db: context().get("db"),
            gatewayMemoryId: fieldArgs.getRaw("gatewayMemoryId"),
          }),
          async ({
            observer,
            db,
            gatewayMemoryId,
          }: {
            observer: Observer | null;
            db: Db;
            gatewayMemoryId: string;
          }) => {
            if (!observer) throw new Error("Unauthorized");
            const userId = observer.id;
            const [existing] = await db
              .select()
              .from(memories)
              .where(
                and(
                  eq(memories.userId, userId),
                  eq(memories.gatewayMemoryId, gatewayMemoryId),
                ),
              );
            if (!existing) return false;

            await db
              .update(memories)
              .set({ deletedAt: new Date(), updatedAt: new Date() })
              .where(eq(memories.id, existing.id));

            events
              .emit({
                type: "beacon.memory.deleted",
                data: { userId, gatewayMemoryId },
                subject: userId,
              })
              .catch((err) => console.warn("[beacon] Event emit failed", err));

            return true;
          },
        ),

      updateMemory: (_$root: Step, fieldArgs: FieldArgs) =>
        lambda(
          object({
            observer: context().get("observer"),
            db: context().get("db"),
            gatewayMemoryId: fieldArgs.getRaw("gatewayMemoryId"),
            pinned: fieldArgs.getRaw("pinned"),
          }),
          async ({
            observer,
            db,
            gatewayMemoryId,
            pinned,
          }: {
            observer: Observer | null;
            db: Db;
            gatewayMemoryId: string;
            pinned?: boolean;
          }) => {
            if (!observer) throw new Error("Unauthorized");
            const userId = observer.id;
            const [existing] = await db
              .select()
              .from(memories)
              .where(
                and(
                  eq(memories.userId, userId),
                  eq(memories.gatewayMemoryId, gatewayMemoryId),
                ),
              );
            if (!existing) throw new Error("Memory not found");

            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (pinned !== undefined) updates.pinned = pinned;

            const [result] = await db
              .update(memories)
              .set(updates)
              .where(eq(memories.id, existing.id))
              .returning();

            events
              .emit({
                type: "beacon.memory.updated",
                data: { userId, gatewayMemoryId, pinned },
                subject: userId,
              })
              .catch((err) => console.warn("[beacon] Event emit failed", err));

            return result;
          },
        ),
    },
  },
});

export default BeaconPlugin;
