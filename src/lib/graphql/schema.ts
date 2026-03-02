import { and, eq, gte, isNull } from "drizzle-orm";
import { createSchema } from "graphql-yoga";
import { computeContentHash } from "../crypto/hash";
import {
  db,
  memories,
  subscriptions,
  syncCursors,
  userPreferences,
} from "../db";
import type { Memory } from "../db/schema";
import { events } from "../providers";

import type { GraphQLContext } from "./context";

type ObserverParent = NonNullable<GraphQLContext["observer"]>;

const typeDefs = /* GraphQL */ `
  type Query {
    """
    The currently authenticated user. Returns null if not authenticated.
    """
    observer: Observer
  }

  type Mutation {
    updatePreferences(input: UpdatePreferencesInput!): UserPreferences!
    createGatewaySession: GatewaySession!
    pushMemories(input: [PushMemoryInput!]!): PushMemoriesResult!
    deleteMemory(gatewayMemoryId: String!): Boolean!
    updateMemory(gatewayMemoryId: String!, pinned: Boolean): Memory!
  }

  type Observer {
    id: ID!
    email: String
    name: String
    avatarUrl: String
    subscription: Subscription
    preferences: UserPreferences
    memories(category: String, limit: Int): [Memory!]!
    memoriesSince(since: String!, deviceId: String!): MemorySyncPayload!
  }

  type Subscription {
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
`;

// Sync page size for delta queries
const SYNC_PAGE_SIZE = 100;

type PushMemoryInput = {
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
};

const resolvers = {
  Query: {
    observer: (_: unknown, __: unknown, ctx: GraphQLContext) => {
      return ctx.observer;
    },
  },

  Observer: {
    subscription: async (observer: ObserverParent) => {
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, observer.id));
      return sub;
    },

    preferences: async (observer: ObserverParent) => {
      const [prefs] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, observer.id));
      return prefs;
    },

    memories: async (
      observer: ObserverParent,
      { category, limit }: { category?: string; limit?: number },
    ) => {
      const conditions = [
        eq(memories.userId, observer.id),
        isNull(memories.deletedAt),
      ];

      if (category) {
        conditions.push(eq(memories.category, category));
      }

      const query = db
        .select()
        .from(memories)
        .where(and(...conditions))
        .orderBy(memories.updatedAt);

      if (limit && limit > 0) {
        query.limit(limit);
      }

      return query;
    },

    memoriesSince: async (
      observer: ObserverParent,
      { since, deviceId }: { since: string; deviceId: string },
    ) => {
      const sinceDate = new Date(since);

      // Fetch memories updated since the given timestamp (include tombstones)
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

      // Determine cursor from last item in page
      const cursor =
        page.length > 0 ? page[page.length - 1].updatedAt.toISOString() : since;

      // Update sync cursor for this device
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
        await db.insert(syncCursors).values({
          userId: observer.id,
          deviceId,
        });
      }

      return {
        memories: page,
        cursor,
        hasMore,
      };
    },
  },

  Mutation: {
    updatePreferences: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          defaultPersona?: string;
          theme?: string;
          voiceEnabled?: boolean;
        };
      },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.observer) throw new Error("Unauthorized");

      const userId = ctx.observer.id;

      // Upsert preferences
      const [existing] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId));

      let result;

      if (existing) {
        const [updated] = await db
          .update(userPreferences)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(userPreferences.id, existing.id))
          .returning();
        result = updated;
      } else {
        const [created] = await db
          .insert(userPreferences)
          .values({
            userId,
            ...input,
          })
          .returning();
        result = created;
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

    createGatewaySession: async (
      _: unknown,
      __: unknown,
      ctx: GraphQLContext,
    ) => {
      if (!ctx.observer) throw new Error("Unauthorized");

      // TODO: Create signed session token with user context
      // For now, return placeholder
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      return {
        sessionId,
        websocketUrl: `wss://gateway.beacon.omni.dev/ws/chat?session=${sessionId}`,
        expiresAt: expiresAt.toISOString(),
      };
    },

    pushMemories: async (
      _: unknown,
      { input }: { input: PushMemoryInput[] },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.observer) throw new Error("Unauthorized");

      const userId = ctx.observer.id;
      let pushed = 0;
      let updated = 0;
      let duplicates = 0;

      for (const item of input) {
        const contentHash = await computeContentHash(item.content);

        // Check for existing memory by user + content hash
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
          const existingUpdatedAt = existing.updatedAt;

          // LWW: only update if incoming is newer
          if (incomingUpdatedAt > existingUpdatedAt) {
            await db
              .update(memories)
              .set({
                gatewayMemoryId: item.gatewayMemoryId,
                category: item.category,
                content: item.content,
                tags: item.tags ?? existing.tags,
                pinned: item.pinned ?? existing.pinned,
                // Take max of access counts
                accessCount: Math.max(
                  item.accessCount ?? 0,
                  existing.accessCount,
                ),
                sourceSessionId:
                  item.sourceSessionId ?? existing.sourceSessionId,
                sourceChannel: item.sourceChannel ?? existing.sourceChannel,
                originDeviceId: item.originDeviceId ?? existing.originDeviceId,
                updatedAt: incomingUpdatedAt,
                deletedAt: item.deletedAt
                  ? new Date(item.deletedAt)
                  : existing.deletedAt,
              })
              .where(eq(memories.id, existing.id));
            updated++;
          } else {
            // Still merge access_count using max
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
          // Insert new memory
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

    deleteMemory: async (
      _: unknown,
      { gatewayMemoryId }: { gatewayMemoryId: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.observer) throw new Error("Unauthorized");

      const userId = ctx.observer.id;

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

      // Soft delete
      await db
        .update(memories)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
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

    updateMemory: async (
      _: unknown,
      {
        gatewayMemoryId,
        pinned,
      }: { gatewayMemoryId: string; pinned?: boolean },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.observer) throw new Error("Unauthorized");

      const userId = ctx.observer.id;

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

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (pinned !== undefined) {
        updates.pinned = pinned;
      }

      const [updated] = await db
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

      return updated;
    },
  },

  Subscription: {
    plan: (sub: { plan: string }) => sub.plan.toUpperCase(),
    status: (sub: { status: string }) =>
      sub.status.toUpperCase().replace("-", "_"),
  },

  Memory: {
    createdAt: (mem: Memory) => mem.createdAt.toISOString(),
    updatedAt: (mem: Memory) => mem.updatedAt.toISOString(),
    deletedAt: (mem: Memory) => mem.deletedAt?.toISOString() ?? null,
  },
};

export const schema = createSchema({
  typeDefs,
  resolvers,
});
