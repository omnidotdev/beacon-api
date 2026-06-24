import { makeJSONPgSmartTagsPlugin } from "postgraphile/utils";

/**
 * Beacon's public API is a curated, sync-oriented surface (the `observer`
 * viewer + memory sync mutations), not raw table CRUD. Omit the underlying
 * tables from Postgraphile's auto-generated schema so `BeaconPlugin` owns the
 * exposed types/operations without name collisions.
 *
 * A follow-up may selectively re-expose tables (with connection filters) if
 * direct CRUD is desired.
 */
const OmitTablesPlugin = makeJSONPgSmartTagsPlugin({
  version: 1,
  config: {
    class: {
      // `-*` removes all behaviors so no type/operations are generated for the
      // table (v5; `omit: true` only drops operations, not the type itself)
      users: { tags: { behavior: "-*" } },
      subscriptions: { tags: { behavior: "-*" } },
      user_preferences: { tags: { behavior: "-*" } },
      memories: { tags: { behavior: "-*" } },
      sync_cursors: { tags: { behavior: "-*" } },
    },
  },
});

export default OmitTablesPlugin;
