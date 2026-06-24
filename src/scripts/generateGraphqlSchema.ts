import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { printSchema } from "graphql";
import { makeSchema } from "postgraphile";

import graphilePreset from "../lib/config/graphile.config";

/**
 * Generate the GraphQL SDL from the Postgres database (database-first).
 * Commit the output; it feeds client codegen.
 * @see https://postgraphile.org/postgraphile/next/exporting-schema
 */
const generateGraphqlSchema = async () => {
  const { schema } = await makeSchema(graphilePreset);

  const generatedDirectory = `${__dirname}/../generated/graphql`;
  if (!existsSync(generatedDirectory))
    mkdirSync(generatedDirectory, { recursive: true });

  writeFileSync(`${generatedDirectory}/schema.graphql`, printSchema(schema));
  console.info("[graphql:generate] Schema generated successfully");
};

await generateGraphqlSchema()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
