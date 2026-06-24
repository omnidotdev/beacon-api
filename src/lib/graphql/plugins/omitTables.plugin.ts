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
      users: { tags: { omit: true } },
      subscriptions: { tags: { omit: true } },
      user_preferences: { tags: { omit: true } },
      memories: { tags: { omit: true } },
      sync_cursors: { tags: { omit: true } },
    },
  },
});

export default OmitTablesPlugin;
