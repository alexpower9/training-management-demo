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

- `development`: local employee/admin/owner role selected with `VITE_DEMO_ROLE`.
- `cognito`: authorization-code flow with PKCE through Amazon Cognito.

Production defaults to Cognito and refuses to expose application data when Cognito settings are
missing. Cognito groups are `employee`, `admin`, and `owner`; accounts outside all three groups are
rejected. Owner takes precedence over admin, which takes precedence over employee. The API
independently verifies every access token and requires admin or owner access for broad employee
readiness, completion history, and record-management operations.

Adding an employee requires a display name and email. Administrators and owners create the
employee's Cognito account, assign it only to the `employee` group, send Cognito's
temporary-password invitation, and store the immutable Cognito `sub` on the employee record.
Cognito subjects are never returned by employee-management API responses. The owner can also
invite new administrators from Manage Administrators. Active employees can access only
`/api/v1/me/readiness`, which returns their own readiness across active sites. Unlinked or archived
employee identities are denied without receiving training data.

For local employee mode, use:

```dotenv
VITE_AUTH_MODE=development
VITE_DEMO_ROLE=employee
VITE_DEMO_SUBJECT=20000000-0000-4000-8000-000000000001
```

The canonical development seed links that subject to the first demo employee.

## Production Build

Build both applications:

```sh
npm run prisma:generate
cp .env.production.example .env.production
# Replace every placeholder in .env.production.
npm run build:production
```

The production build preflight rejects development authentication, placeholder
Cognito values, and invalid callback URLs.

The API can receive `DATABASE_URL` directly or retrieve an RDS secret using `DATABASE_SECRET_ARN`
and the EC2 instance role. Secret-based production connections also require
`RDS_CA_CERT_PATH` and use strict certificate verification. Keep RDS in private
subnets and allow port 5432 only from the API instance security group.

See [Production Deployment Runbook](docs/production-deployment-runbook.md) for
the complete local, staging, Cognito, RDS, EC2, DNS, TLS, monitoring, backup,
and launch sequence.

## EC2 Redeployment

After the initial EC2 provisioning in the production runbook, install the
fixed-purpose systemd units and opt-in Git hooks:

```sh
npm run deploy:ec2:setup
npm run deploy:ec2
```

Future fast-forward updates can be fetched and deployed with:

```sh
npm run deploy:ec2:update
```

The installed hooks pin the current branch as the production branch and run
after a successful `git pull` on it or a switch back to it. Deployments require
a clean worktree, are serialized with a lock, and record the successful commit
in `.deployment/deployments.log`.
