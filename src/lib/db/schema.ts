import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  identityProviderId: text("identity_provider_id").unique().notNull(),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  aetherSubscriptionId: text("aether_subscription_id").unique(),
  plan: text("plan").notNull().default("free"), // 'free', 'pro', 'team'
  status: text("status").notNull().default("active"), // 'active', 'canceled', 'past_due'
  creditsRemaining: integer("credits_remaining").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  defaultPersona: text("default_persona").default("orin"),
  theme: text("theme").default("system"),
  voiceEnabled: boolean("voice_enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Gateway-assigned memory ID (mem_<uuid>), used for cross-device dedup
    gatewayMemoryId: text("gateway_memory_id").notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    // SHA-256 of content, for dedup
    contentHash: text("content_hash").notNull(),
    tags: text("tags").notNull().default("[]"),
    pinned: boolean("pinned").notNull().default(false),
    accessCount: integer("access_count").notNull().default(0),
    sourceSessionId: text("source_session_id"),
    sourceChannel: text("source_channel"),
    // Which device created this memory
    originDeviceId: text("origin_device_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Soft delete tombstone
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("memories_user_content_hash").on(table.userId, table.contentHash),
  ],
);

export const syncCursors = pgTable(
  "sync_cursors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    deviceId: text("device_id").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("sync_cursors_user_device").on(table.userId, table.deviceId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type UserPreference = typeof userPreferences.$inferSelect;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type SyncCursor = typeof syncCursors.$inferSelect;
