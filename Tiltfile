# Beacon API Development

load("ext://dotenv", "dotenv")

# Load environment from metarepo
env_file = "../../.env.local"
if os.path.exists(env_file):
    dotenv(fn=env_file)

project_name = "beacon-api"

# Run the API dev server
local_resource(
    "dev-%s" % project_name,
    serve_cmd="bun run dev",
    deps=["src", "package.json"],
    labels=[project_name],
)

# Lint
local_resource(
    "lint-%s" % project_name,
    cmd="bun check",
    deps=["src", "biome.json"],
    labels=[project_name],
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
)

# Database migrations
local_resource(
    "db-migrate-%s" % project_name,
    cmd="bun db:migrate",
    labels=[project_name],
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
)

# Database studio
local_resource(
    "db-studio-%s" % project_name,
    serve_cmd="bun db:studio",
    labels=[project_name],
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
)
