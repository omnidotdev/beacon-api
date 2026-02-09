<div align="center">

# Beacon API

GraphQL API for Beacon

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)

</div>

## Overview

Beacon API is the backend service for Beacon, providing a GraphQL interface built with Elysia and Drizzle ORM on PostgreSQL.

## Features

- **GraphQL** - Schema-first API with GraphQL Yoga
- **Authentication** - JWT-based auth with Better Auth
- **Database** - PostgreSQL with Drizzle ORM and migrations
- **Rate Limiting** - Built-in request throttling

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- PostgreSQL

## Development

```bash
# From metarepo root
tilt up

# Or directly
bun i
bun dev
```

## Database

```bash
bun db:generate   # Generate migrations
bun db:migrate    # Apply migrations
bun db:studio     # Open Drizzle Studio
```

## License

The code in this repository is licensed under MIT, &copy; [Omni LLC](https://omni.dev). See [LICENSE.md](LICENSE.md) for more information.
