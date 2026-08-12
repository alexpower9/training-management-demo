# NME Training and Medical Compliance

Internal training and medical-compliance application for Northern Mining Equipment.

## Application Structure

- `src/`: Vue Training, Medical, and management workspaces with Cognito authentication.
- `server/`: Fastify TypeScript API with Cognito JWT verification and Prisma.
- `server/prisma/`: Eight-table PostgreSQL schema, additive migrations, and canonical demo seed.
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
`server/.env`. Development authentication defaults to an administrator.
Training, Medical, and Management use the API by default so management changes
are immediately reflected in site readiness.

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

The Training and Medical workspaces are available at `/training` and `/medical`.
The management workspace is available at `/manage`.

Medical catalogue, site-requirement, and completion records use independent
tables while sharing employees and sites with Training. The canonical seed
deliberately starts the Medical catalogue empty. Site access requires every
configured course and medical to be current; a domain with no requirements is
neutral, while a site with no requirements in either domain remains ineligible.

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
Every employee row is initially created with a Cognito account. Manage Employees reads account
setup state live from the `employee` group and matches it by `sub`; Cognito subjects are never
returned by employee-management API responses. `FORCE_CHANGE_PASSWORD` means the invitation is
pending, while `CONFIRMED` means account setup is complete, not that the employee has used the
application.

Administrators and owners can resend an invitation for an active employee whose invitation is
pending. Cognito generates a new temporary password, restarts its validity period, and supersedes
the previous temporary password. The API coalesces concurrent requests and applies a short resend
attempt cooldown. Archived employees and disabled, confirmed, missing, mismatched, or
otherwise ineligible accounts cannot be resent. If the Cognito group lookup fails, employee records
remain available with account status shown as unavailable. The API calls Cognito for invitation
delivery; it does not call Amazon SES directly.

Development authentication emulates newly created Cognito accounts only in the running API
process. Seeded employees show Status unavailable, and restarting the API clears locally emulated
account status and resend eligibility. Production Cognito state is not affected.

The owner can also invite new administrators from Manage Administrators. Active employees use
`/api/v1/me/readiness` and `/api/v1/me/medical-readiness`, which return only their own readiness
across active sites. Missing, unmatched, or archived employee identities are denied without
receiving compliance data.

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

Local development can use `DATABASE_URL`. Production must retrieve
least-privilege runtime credentials using `DATABASE_SECRET_ARN`; remove any
persistent direct URL from API environment files, systemd overrides, and shell
profiles. Production startup rejects configuring both sources. Production
migrations require a distinct
`MIGRATION_DATABASE_SECRET_ARN` and database-owner role. The protected
migration command applies migrations, grants the runtime role only the
documented eight-table DML allowlist, and reconnects with the runtime secret to
verify those privileges before the API restarts. Secret-based production
connections also require `RDS_CA_CERT_PATH` and use strict certificate
verification. Keep this application in a dedicated database and `public`
schema on private RDS subnets, with port 5432 allowed only from approved
application or migration runners.

For the strongest credential boundary, run migrations in a protected
CI/CodeBuild job with its own IAM role and let EC2 retrieve only the runtime
secret. The same-EC2 one-shot migration unit is supported as an initial
fallback and runs under a separate `nme-migration` system identity.

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

When migrations run only in protected CI/CodeBuild and no migration credential
exists on EC2, use `NME_EC2_EXTERNAL_MIGRATIONS=1 npm run deploy:ec2:setup`,
then deploy with the migration-skip and compatibility-confirmation guards below.

In same-host migration mode, future fast-forward updates can be fetched and
deployed with:

```sh
npm run deploy:ec2:update
```

When a protected migration job has already succeeded for the exact release,
first pull with `NME_SKIP_AUTO_DEPLOY=1 git pull --ff-only`, then deploy the
application with
`NME_DEPLOY_SKIP_MIGRATIONS=1 NME_SCHEMA_COMPATIBILITY_CONFIRMED=1 NME_EXTERNAL_MIGRATION_COMMIT=$(git rev-parse HEAD) npm run deploy:ec2`. Use the same guard for an
application rollback only after verifying the older artifact against the
currently migrated schema; database migrations are not rolled back with the
application. External-migration setup disables automatic Git-hook deployment
because every release needs an approved receipt for its exact commit.

In same-host mode, the installed hooks pin the current branch as the production
branch and run after a successful `git pull` on it or a switch back to it.
External mode deliberately skips those automatic deployments. Deployments require
a clean worktree, are serialized with a lock, and record the successful commit
in `.deployment/deployments.log`.
