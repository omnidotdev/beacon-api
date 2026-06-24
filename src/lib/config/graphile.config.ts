import { PgSimplifyInflectionPreset } from "@graphile/simplify-inflection";
import { makePgService } from "postgraphile/adaptors/pg";
import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { PostGraphileConnectionFilterPreset } from "postgraphile-plugin-connection-filter";
import BeaconPlugin from "../graphql/plugins/beacon.plugin";
import OmitTablesPlugin from "../graphql/plugins/omitTables.plugin";
import { env } from "./env";

/**
 * Graphile preset. The base schema is generated database-first from the
 * Postgres tables; beacon's custom sync/viewer behavior is layered on via
 * BeaconPlugin (never a hand-written executable schema).
 * @see https://postgraphile.org
 */
const graphilePreset: GraphileConfig.Preset = {
  extends: [
    PostGraphileAmberPreset,
    PgSimplifyInflectionPreset,
    PostGraphileConnectionFilterPreset,
  ],
  plugins: [OmitTablesPlugin, BeaconPlugin],
  schema: {
    retryOnInitFail: env.nodeEnv === "production",
    sortExport: true,
    pgForbidSetofFunctionsToReturnNull: true,
    connectionFilterAllowNullInput: true,
    connectionFilterAllowEmptyObjectInput: true,
  },
  pgServices: [makePgService({ connectionString: env.databaseUrl })],
  grafast: { explain: env.nodeEnv === "development" },
};

export default graphilePreset;
