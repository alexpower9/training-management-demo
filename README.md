# NME Training Compliance

Internal training-compliance application for Northern Mining Equipment.

## Application Structure

- `src/`: Vue training and management workspaces with Cognito authentication.
- `server/`: Fastify TypeScript API with Cognito JWT verification and Prisma.
- `server/prisma/`: Five-table PostgreSQL schema, custom migration, and canonical demo seed.
- `deploy/`: Nginx and systemd templates for an EC2 deployment.

The browser never connects directly to PostgreSQL. Production traffic follows:

```text
Vue client -> Nginx /api proxy -> Fastify API -> private RDS PostgreSQL
```

## Local Setup

Install all frontend and API workspace dependencies:

```sh
npm install
```

Copy `.env.example` to `.env` for the frontend and `server/.env.example` to
`server/.env`. Development authentication defaults to an administrator. Both
Training and Management use the API by default so management changes are
immediately reflected in site readiness.

Start PostgreSQL 17, apply the migration, and seed the canonical dataset:

```sh
npm run db:up
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Start the API and frontend in separate terminals:

```sh
npm run dev:api
npm run dev
```

The management workspace is available at `/manage`.

## Verification

Run the database-independent suites and production builds:

```sh
npm test
npm run test:api
npm run prisma:generate
npm run build:all
```

PostgreSQL integration and Playwright tests use the isolated
`nme_training_test` database on port 5433:

```sh
npm run db:test:up
export TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5433/nme_training_test?schema=public'
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

The integration and browser setup scripts refuse destructive migration resets
unless the configured database name is exactly `nme_training_test`.

## Authentication

The application supports two modes:

- `development`: local viewer/admin role selected with `VITE_DEMO_ROLE`.
- `cognito`: authorization-code flow with PKCE through Amazon Cognito.

Production defaults to Cognito and refuses to expose application data when Cognito settings are
missing. Cognito groups are `viewer` and `admin`; users without the admin group are treated as
viewers. The API independently verifies every access token and requires admin access for mutations.

## Production Build

Build both applications:

```sh
npm run prisma:generate
npm run build:all
```

For the frontend build, set `VITE_AUTH_MODE=cognito`, `VITE_DATA_SOURCE=api`, and the Cognito
variables documented in `.env.example`.

The API can receive `DATABASE_URL` directly or retrieve an RDS secret using `DATABASE_SECRET_ARN`
and the EC2 instance role. Keep RDS in private subnets and allow port 5432 only from the API
instance security group.

See [Production Deployment Runbook](docs/production-deployment-runbook.md) for
the complete local, staging, Cognito, RDS, EC2, DNS, TLS, monitoring, backup,
and launch sequence.
