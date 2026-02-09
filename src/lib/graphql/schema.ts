import { eq } from "drizzle-orm";
import { createSchema } from "graphql-yoga";
import { encryptProviderKey, getKeyHint } from "../crypto/keys";
import { db, providerKeys, subscriptions, userPreferences, users } from "../db";
import type { GraphQLContext } from "./context";

const typeDefs = /* GraphQL */ `
  type Query {
    me: User
    myProviders: [ProviderKey!]!
    mySubscription: Subscription
    myPreferences: UserPreferences
  }

  type Mutation {
    setProviderKey(provider: Provider!, apiKey: String!, modelPreference: String): ProviderKey!
    deleteProviderKey(provider: Provider!): Boolean!
    updatePreferences(input: UpdatePreferencesInput!): UserPreferences!
    createGatewaySession: GatewaySession!
  }

  type User {
    id: ID!
    email: String
    name: String
    avatarUrl: String
    createdAt: String!
  }

  type ProviderKey {
    id: ID!
    provider: Provider!
    keyHint: String
    modelPreference: String
    createdAt: String!
  }

  enum Provider {
    OPENAI
    ANTHROPIC
    OPENROUTER
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
`;

const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.userId) return null;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.userId));
      return user;
    },

    myProviders: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.userId) return [];
      return db
        .select()
        .from(providerKeys)
        .where(eq(providerKeys.userId, ctx.userId));
    },

    mySubscription: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.userId) return null;
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.userId));
      return sub;
    },

    myPreferences: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.userId) return null;
      const [prefs] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, ctx.userId));
      return prefs;
    },
  },

  Mutation: {
    setProviderKey: async (
      _: unknown,
      {
        provider,
        apiKey,
        modelPreference,
      }: { provider: string; apiKey: string; modelPreference?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.userId) throw new Error("Unauthorized");

      const encrypted = await encryptProviderKey(apiKey);
      const hint = getKeyHint(apiKey);
      const providerLower = provider.toLowerCase();

      // Upsert provider key
      const [existing] = await db
        .select()
        .from(providerKeys)
        .where(eq(providerKeys.userId, ctx.userId))
        .where(eq(providerKeys.provider, providerLower));

      if (existing) {
        const [updated] = await db
          .update(providerKeys)
          .set({
            encryptedKey: encrypted,
            keyHint: hint,
            modelPreference,
            updatedAt: new Date(),
          })
          .where(eq(providerKeys.id, existing.id))
          .returning();
        return updated;
      }

      const [created] = await db
        .insert(providerKeys)
        .values({
          userId: ctx.userId,
          provider: providerLower,
          encryptedKey: encrypted,
          keyHint: hint,
          modelPreference,
        })
        .returning();

      return created;
    },

    deleteProviderKey: async (
      _: unknown,
      { provider }: { provider: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.userId) throw new Error("Unauthorized");

      await db
        .delete(providerKeys)
        .where(eq(providerKeys.userId, ctx.userId))
        .where(eq(providerKeys.provider, provider.toLowerCase()));

      return true;
    },

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
      if (!ctx.userId) throw new Error("Unauthorized");

      // Upsert preferences
      const [existing] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, ctx.userId));

      if (existing) {
        const [updated] = await db
          .update(userPreferences)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(userPreferences.id, existing.id))
          .returning();
        return updated;
      }

      const [created] = await db
        .insert(userPreferences)
        .values({
          userId: ctx.userId,
          ...input,
        })
        .returning();

      return created;
    },

    createGatewaySession: async (
      _: unknown,
      __: unknown,
      ctx: GraphQLContext,
    ) => {
      if (!ctx.userId) throw new Error("Unauthorized");

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
  },

  ProviderKey: {
    provider: (key: { provider: string }) => key.provider.toUpperCase(),
    createdAt: (key: { createdAt: Date }) => key.createdAt?.toISOString(),
  },

  User: {
    createdAt: (user: { createdAt: Date }) => user.createdAt?.toISOString(),
  },

  Subscription: {
    plan: (sub: { plan: string }) => sub.plan.toUpperCase(),
    status: (sub: { status: string }) =>
      sub.status.toUpperCase().replace("-", "_"),
  },
};

export const schema = createSchema({
  typeDefs,
  resolvers,
});
