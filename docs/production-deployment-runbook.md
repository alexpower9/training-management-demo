# Production Deployment Runbook

Status: launch plan for the current Vue, Fastify, Prisma, Amazon Cognito, EC2,
and Amazon RDS implementation.

## 1. What The Current Error Means

Vite proxies `/api/*` to `http://127.0.0.1:3000`. An `ECONNREFUSED` response
means the Vue development server is running but the Fastify API is not.

Management always uses the API. The Training screen may use demo data, but
`/manage` cannot work without Fastify and PostgreSQL.

## 2. Get The Full Application Running Locally

Install:

- Node.js 24 LTS;
- Docker Desktop; and
- Git.

From the repository root:

```sh
npm install
cp .env.example .env
cp server/.env.example server/.env
```

Set the frontend development environment:

```dotenv
VITE_AUTH_MODE=development
VITE_DEMO_ROLE=admin
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=/api/v1
```

The default `server/.env.example` values already target the local Docker
database.

Start PostgreSQL and initialize it:

```sh
npm run db:up
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Start the API:

```sh
npm run dev:api
```

Confirm it is listening before starting Vue:

```sh
curl http://127.0.0.1:3000/health
```

Expected response:

```json
{"status":"ok"}
```

In another terminal:

```sh
npm run dev
```

Use `/manage` with the default development administrator role. Change
`VITE_DEMO_ROLE` to `employee` and set `VITE_DEMO_SUBJECT` to a linked UUID to
test employee self-service authorization. Use either the administrator or
owner role to test employee invitations, and use the owner role to test
administrator invitations.

## 3. Recommended First Production Architecture

The lowest-complexity production architecture that matches this repository is:

```text
Users
  -> DNS and HTTPS
  -> Nginx on one EC2 instance
       -> static Vue files
       -> /api proxy to Fastify on 127.0.0.1:3000
  -> private RDS PostgreSQL 17

Users
  -> Amazon Cognito managed login
  -> authorization-code flow with PKCE
  -> Vue sends Cognito access token to Fastify
```

This is appropriate for a small internal v1. The EC2 instance is a single
point of failure. A later high-availability version should place an Application
Load Balancer with an ACM certificate in front of two EC2 instances in an Auto
Scaling group.

Use one AWS Region for EC2, RDS, Cognito, Secrets Manager, and CloudWatch.
The current deployment uses `us-east-1`.

## 4. AWS Account And Domain Preparation

Before creating application resources:

1. Enable MFA for privileged AWS identities.
2. Use IAM Identity Center or separate IAM roles instead of daily root-user
   access.
3. Create an AWS Budget and billing alerts.
4. Choose the production hostname, for example
   `training.your-company-domain.com`.
5. Put the domain in Route 53 or prepare to create the equivalent DNS record
   with the existing DNS provider.
6. Decide whether production data may contain information that requires a
   formal retention, privacy, or audit policy.

Do not use the demo seed in production unless the environment is explicitly a
demonstration system.

## 5. Network And Security Groups

Create or select a VPC with at least two Availability Zones.

For the initial single-EC2 architecture:

- Put RDS in a DB subnet group containing private subnets.
- Set RDS `Public access` to `No`.
- Put EC2 in a public subnet with an Elastic IP.
- Allow EC2 inbound TCP 80 and 443 from the intended users. If the application
  is truly internal, restrict this to company/VPN address ranges.
- Do not expose Fastify port 3000.
- Do not expose PostgreSQL port 5432 to the internet.
- Create an RDS security group whose only PostgreSQL inbound source is the EC2
  security group.
- Prefer Systems Manager Session Manager over inbound SSH. If SSH is
  temporarily required, restrict port 22 to a known administrator address and
  remove the rule afterward.

The EC2 instance needs outbound HTTPS to contact Cognito, Secrets Manager, AWS
APIs, package repositories, and Cognito JSON Web Key endpoints.

## 6. Create The RDS PostgreSQL Database

Create an Amazon RDS for PostgreSQL instance with:

- PostgreSQL 17, using a currently available minor version;
- database name `nme_training`;
- encryption at rest enabled;
- private access only;
- storage autoscaling enabled;
- deletion protection enabled;
- automated backups enabled, normally with 7 to 35 days retention;
- an explicit maintenance window and backup window;
- Performance Insights or Database Insights as appropriate for the chosen
  instance class; and
- Multi-AZ if the business requires availability beyond a single-AZ v1.

The migration and privilege automation assumes that `nme_training` is a
dedicated database and that its `public` schema is reserved for this
application. All Prisma migrations, `_prisma_migrations`, and the eight
business tables must be in that schema. Do not point the automation at a
database whose `public` schema contains another application's objects. The
migration step revokes public schema creation, resets the runtime role's table
privileges, and rejects runtime access to tables outside its explicit
allowlist.

Use separate credentials:

- a migration owner that owns the `public` schema and all application tables,
  and can create extensions, tables, indexes, and constraints; and
- an application user used by Fastify at runtime.

The application user should have:

- `CONNECT` on the database;
- no database `CREATE` or `TEMP` privilege;
- `USAGE` on the application schema;
- `SELECT`, `INSERT`, and `UPDATE` on `employee`, `site`, `course`, and
  `medical`;
- `SELECT`, `INSERT`, and `DELETE` on `site_course_requirement` and
  `site_medical_requirement`, with no `UPDATE`;
- `SELECT` and `INSERT` on `course_completion` and `medical_completion`, plus
  column-level `UPDATE` only on `voided_at`, `voided_by_subject`, and
  `void_reason`;
- no sequence privileges (the current schema uses UUID defaults);
- no table-level completion `UPDATE`, no completion `DELETE`, and no assignment
  `UPDATE`; and
- no schema-change permission.

Configure the runtime role as `LOGIN NOINHERIT`: no role memberships and no
`SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, or bypass-RLS option. It
must not inherit privileges from the migration role or an RDS administrative
role.

Database migrations and grants must run as the migration owner, never as the
application user. The automated migration step removes existing runtime table
privileges before applying this allowlist, so an older over-privileged runtime
role does not remain over-privileged after deployment.

### First-deployment role bootstrap

Prisma and `npm run migrate:production` do not create the database or database
roles. Before the first deployment, a privileged RDS bootstrap identity must:

1. create the dedicated `nme_training` database;
2. create distinct login roles for migration and runtime use, with separately
   generated passwords;
3. make the migration role the database owner and owner of the `public`
   schema;
4. revoke `CONNECT`, `CREATE`, and `TEMP` on this dedicated database from
   `PUBLIC`, explicitly grant `CONNECT` to the migration and runtime roles,
   revoke runtime `CREATE` and `TEMP`, and remove any privileged runtime
   memberships; and
5. store each role's credentials in its own Secrets Manager secret.

Use an approved infrastructure-as-code or privileged database-administration
workflow so generated passwords do not enter shell history. Do not grant the
runtime role membership in the migration role. The first migration run creates
`_prisma_migrations` and the application tables as the migration owner, then
applies and verifies the runtime allowlist. The bootstrap identity does not
need to remain available to either application service afterward.

### One-time cutover for an existing installation

An installation that previously used one direct database login must transfer
object ownership before enabling the split-role deployment. Schedule a
maintenance window and take an RDS snapshot, then:

1. stop application writes and record the current database, schema, table,
   sequence, function, extension, and `_prisma_migrations` owners, plus any
   role or parameter grants held by the legacy login;
2. create the new migration role and a distinct runtime role (or retain the
   old application role only as the restricted runtime role);
3. using the current owner or RDS administrative identity, transfer the
   dedicated database, `public` schema, `_prisma_migrations`, and every
   application table, sequence, function, and remaining extension to the
   migration role; revoke any privileged parameter grants such as permission
   to set `session_replication_role`;
4. verify that no application object remains owned by the runtime role, that
   it has no role membership or privileged parameter grant, and that the
   migration role can alter the schema and migration history;
5. create the two Secrets Manager secrets, update the service environment as
   described below, and remove any persistent direct `DATABASE_URL`; and
6. run `nme-migrate.service` once before restarting the API. It applies pending
   migrations, replaces legacy grants with the allowlist, and reconnects as the
   runtime role to verify the result.

`REASSIGN OWNED` may be appropriate when the legacy role owns only objects in
this dedicated database, but review its complete target set first. Do not use
`DROP OWNED`, and do not perform an ownership transfer in a shared database.
Resume writes only after migration, runtime privilege verification, API
health, and core Training and Medical checks succeed.

## 7. Store Database Credentials

Create a runtime Secrets Manager secret containing JSON with:

```json
{
  "username": "nme_training_app",
  "password": "generated-password",
  "host": "database.abc123.us-east-1.rds.amazonaws.com",
  "port": 5432,
  "dbname": "nme_training"
}
```

Create a separate migration secret with the same shape and the migration-owner
username and password. The two secret ARNs and database usernames must differ;
the migration command rejects a shared secret or role.

The recommended production credential boundary is a protected CI or CodeBuild
release job with its own IAM role. Give that job access to the migration
secret and the runtime secret (the latter is needed only for post-grant
verification), and give the EC2 instance role access only to the runtime
secret. The release job applies the migration and validates privileges before
the application deployment runs with `NME_DEPLOY_SKIP_MIGRATIONS=1`. Protect
the job with approvals, restricted logs and artifacts, and no untrusted pull
request execution.

Attach an IAM role to EC2 through an instance profile. In the recommended
split workflow, grant only:

- `secretsmanager:GetSecretValue` for the runtime secret;
- `kms:Decrypt` for the runtime secret's key if it uses a customer-managed KMS
  key;
- `cognito-idp:ListUsersInGroup`, `cognito-idp:AdminCreateUser`,
  `cognito-idp:AdminAddUserToGroup`, and `cognito-idp:AdminDeleteUser` for this
  application's user-pool ARN;
- Systems Manager permissions; and
- CloudWatch log and metric permissions.

Do not store AWS access keys on EC2. The AWS SDK automatically uses the
instance-role credentials.

For a small initial deployment, the repository also supports running the
one-shot migration service on EC2. That transitional workflow additionally
requires the instance role to read the migration secret and decrypt its KMS
key. It is operational separation between systemd services, not a strong
credential boundary.

Employee account-state lookup and invitation resend use the existing
`ListUsersInGroup` and `AdminCreateUser` permissions. They require no additional
IAM actions or direct Amazon SES permission.

The API reads `DATABASE_SECRET_ARN` at startup. After a database-secret
rotation, restart the API service so it creates a new pool with the current
credentials.

When the same-host fallback is used, the migration unit reads
`MIGRATION_DATABASE_SECRET_ARN` from an environment file readable only by root
and the dedicated migration service identity; the API unit does not receive
that variable. A compromised host or process able to use the instance-role
credentials could nevertheless retrieve the migration secret. Move migration
execution to the recommended protected release job before the threat model
requires a strong boundary; then remove the migration environment file and all
migration-secret/KMS access from the EC2 role.

## 8. Require And Validate Database TLS

RDS supports encrypted PostgreSQL connections and publishes a regional CA
bundle. Prisma 6 accepts invalid certificates by default unless
`sslaccept=strict` is set, and its `sslcert` parameter reads one certificate
rather than the complete bundle.

Before launch:

1. In the RDS console, note the database's Certificate authority identifier,
   normally `rds-ca-rsa2048-g1`.
2. Install that exact root certificate from the regional bundle:

   ```sh
   sudo deploy/install-rds-ca.sh us-east-1 rds-ca-rsa2048-g1
   ```

3. Set `RDS_CA_CERT_PATH` to the installed certificate path.
4. Configure Prisma with `sslmode=require`, `sslaccept=strict`, and the
   installed certificate. The Secrets Manager URL builder does this
   automatically.
5. Test the RDS endpoint hostname against the certificate.
6. Document CA rotation as an operational task.

The API refuses to start in production when `DATABASE_SECRET_ARN` is set
without `RDS_CA_CERT_PATH`.

## 9. Configure Amazon Cognito

Create one Cognito user pool for production.

Recommended settings:

1. Disable public self-registration for this internal application.
2. Choose the required sign-in identifier, normally email.
3. Keep password sign-in enabled and do not enable passwordless email or SMS
   one-time-password sign-in. The API relies on Cognito generating a temporary
   password for each administrator-created user.
4. Require a strong password policy and explicitly set **Temporary passwords
   set by administrators expire in**, for example to 7 days. Record the chosen
   value in the production configuration inventory.
5. Enable MFA according to company policy; MFA is strongly recommended for
   administrators.
6. Create a Cognito managed-login domain.
7. Create a public browser app client with no client secret.
8. Enable only the authorization-code OAuth grant.
9. Enable PKCE.
10. Allow scopes `openid`, `profile`, and `email`.
11. Register the exact callback URL:
    `https://training.your-company-domain.com/auth/callback`.
12. Register the exact sign-out URL:
    `https://training.your-company-domain.com/training`.

Create these user-pool groups:

- `owner`
- `admin`
- `employee`

Create the initial owner manually and add only that account to `owner`. Add
record managers to `admin` and normal users to `employee`. Accounts in none of
these groups are rejected. Owner takes precedence over admin, which takes
precedence over employee, if an account is temporarily present in multiple
groups. Require MFA for the owner account and tightly restrict AWS identities
that can change user-pool group membership.
Fastify verifies the Cognito access-token signature, client ID, token use, and
expiry independently.

Administrators and owners add employees from Manage Employees with a display
name and email. The API creates the Cognito user with delivery suppressed, adds
it only to the `employee` group, stores its immutable `sub`, and then requests
the standard temporary-password email. Email and display name are not
authorization keys, and Cognito subjects are never returned by management API
responses. An archived employee remains denied until restored.

Every employee database row is initially created with a Cognito account. Manage
Employees loads the live `employee` group and matches accounts to employee rows by
immutable `sub`. `FORCE_CHANGE_PASSWORD` means the invitation is pending;
`CONFIRMED` means setup is complete, but does not prove that the employee has
used the application. If Cognito account lookup fails, employee records remain
manageable and their account status is reported as unavailable.

Administrators and owners can resend an invitation only for an active employee
whose Cognito account is enabled and still in `FORCE_CHANGE_PASSWORD`. Cognito's
`RESEND` operation generates and emails a new temporary password, restarts the
temporary-password validity period, and supersedes the old password. Archived,
disabled, confirmed, missing, email-mismatched, and otherwise ineligible accounts
are rejected. The API coalesces concurrent requests in the running process and
applies a short resend-attempt cooldown. The feature stores no password or
account-status snapshot, requires no database migration, and calls Cognito rather
than Amazon SES directly.

The current small-workforce implementation enumerates the paginated `employee`
group for each employee list, detail, and resend eligibility check. If the pool
grows enough for this to affect latency or Cognito quotas, add a bounded status
cache or a dedicated reconciliation design before scaling the API horizontally.

Account mismatch states require operator investigation; the application has no
manual relink endpoint. For `missing`, first check whether the account with the
stored subject still exists but was removed from the `employee` group, and restore
that membership if appropriate. For `disabled`, confirm the reason before enabling
the account. A deleted account or changed email requires a controlled data-repair
incident; do not create a replacement and assume its new `sub` will link itself.

The owner can invite administrators from Manage Administrators. The API uses
its EC2 role to call Cognito, creates the user, and adds it only to the
hardcoded `admin` group. There is no API operation that can create another
owner.

Configure the Cognito user-pool invitation message template before launch. The
message must retain both Cognito placeholders:

```text
Your NME Training account is ready.
Sign in at https://training.your-company-domain.com/training
Username: {username}
Temporary password: {####}
```

Cognito does not deliver a password-based invitation when its template omits
`{####}`. Keep the application sign-in URL environment-specific and verify
delivery in staging for both employee and administrator invitations.

Do not use Cognito's default email configuration for normal production
delivery. It has a non-adjustable quota of 50 messages per AWS account per day,
including invitations and other Cognito email flows, and resets at 09:00 UTC.
In the user pool's email configuration, select **Send email from Amazon SES**,
use a verified sender identity, and move that SES Region out of the sandbox
before inviting production users. SES then supplies the applicable sending
quota and delivery monitoring.

Monitor SES sending quota, bounces, complaints, and delivery metrics separately
in AWS. The application does not receive message-open events, and neither SES
delivery nor Cognito `CONFIRMED` status proves that an employee has used the
application.

For pre-production testing, add localhost callback and sign-out URLs only to a
separate non-production app client.

## 10. Prepare EC2

Launch Amazon Linux 2023 with:

- an instance size appropriate for the user count, starting small and scaling
  after observing CPU and memory;
- encrypted EBS storage;
- the EC2 IAM role described above;
- detailed monitoring if required; and
- Systems Manager enabled.

Install:

```sh
sudo dnf update -y
sudo dnf install -y git nginx nodejs24 nodejs24-npm certbot rsync util-linux
sudo alternatives --set node /usr/bin/node-24
node --version
npm --version
```

Create the service account and directories:

```sh
id nme-training >/dev/null 2>&1 || \
  sudo useradd --system --home-dir /opt/nme-training --shell /sbin/nologin nme-training
id nme-migration >/dev/null 2>&1 || \
  sudo useradd --system --home-dir /nonexistent --shell /sbin/nologin nme-migration
sudo usermod --append --groups nme-training nme-migration
sudo mkdir -p /opt/nme-training /var/www/nme-training /var/www/certbot /etc/nme-training
sudo chown -R "$USER":nme-training /opt/nme-training
sudo chmod 0750 /opt/nme-training
```

Deploy source or a CI-built artifact to `/opt/nme-training`. Production should
use `npm ci`, never an unpinned `npm install`. The regular EC2 deployment user
owns the checkout; the `nme-training` service group gives both service
identities read-only traversal of it. Create `nme-migration` before installing
or starting `nme-migrate.service`. It has no login shell and must never run the
long-lived API.

The supplementary group is a compatibility measure for the same-host
checkout, not an ideal release boundary. Verify that the group has no write
permission on the repository, migration files, built server, or dependencies.
Prefer a CI-built, checksummed immutable release artifact installed root-owned
and readable by the service identities; run the protected migration from that
exact artifact rather than from a mutable checkout.

## 11. Production Environment Values

Frontend values are compiled into the Vue bundle. Copy the tracked template,
then replace every placeholder:

```sh
cp .env.production.example .env.production
```

These frontend values are identifiers and URLs, not secrets. Never put a
Cognito client secret or database credential in a `VITE_*` variable.
`.env.production` is ignored by Git.

Create `/etc/nme-training/api.env`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
AUTH_MODE=cognito
COGNITO_USER_POOL_ID=us-east-1_POOL_ID
COGNITO_CLIENT_ID=APP_CLIENT_ID
DATABASE_SECRET_ARN=arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:SECRET_NAME
DATABASE_HOST=database.example.us-east-1.rds.amazonaws.com
DATABASE_PORT=5432
DATABASE_NAME=nme_training
RDS_CA_CERT_PATH=/etc/pki/rds/rds-ca-rsa2048-g1.pem
AWS_REGION=us-east-1
```

Protect it:

```sh
sudo chown root:nme-training /etc/nme-training/api.env
sudo chmod 640 /etc/nme-training/api.env
```

`DATABASE_SECRET_ARN` must contain the runtime application credentials. A
production API must not receive a persistent `DATABASE_URL`: remove that
variable from `/etc/nme-training/api.env`, systemd overrides, shell profiles,
and deployment configuration during an existing-install cutover. Use
`DATABASE_URL` only for local development and for the short-lived Prisma child
process constructed by the protected migration command. Never paste a
production URL into a command line, tracked file, or service environment. API
startup rejects an ambiguous production configuration that supplies both
`DATABASE_URL` and `DATABASE_SECRET_ARN`.

When the same-EC2 migration fallback is used, create a self-contained migration
environment. The migration unit deliberately does not read `api.env`:

```sh
if ! sudo test -e /etc/nme-training/migration.env; then
  sudo install -o root -g nme-migration -m 0640 /dev/null /etc/nme-training/migration.env
fi
sudo chown root:nme-migration /etc/nme-training/migration.env
sudo chmod 640 /etc/nme-training/migration.env
sudoedit /etc/nme-training/migration.env
```

```dotenv
MIGRATION_DATABASE_SECRET_ARN=arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:MIGRATION_SECRET_NAME
DATABASE_SECRET_ARN=arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:RUNTIME_SECRET_NAME
DATABASE_HOST=database.example.us-east-1.rds.amazonaws.com
DATABASE_PORT=5432
DATABASE_NAME=nme_training
RDS_CA_CERT_PATH=/etc/pki/rds/rds-ca-rsa2048-g1.pem
AWS_REGION=us-east-1
```

Confirm its protection after editing:

```sh
sudo chown root:nme-migration /etc/nme-training/migration.env
sudo chmod 640 /etc/nme-training/migration.env
```

Only root and the dedicated unprivileged `nme-migration` identity can read this
file; the long-lived `nme-training` API identity cannot. The migration service
receives only this environment file; do not copy API authentication settings
into it, and do not add `MIGRATION_DATABASE_SECRET_ARN` to `api.env`.

In the recommended CI/CodeBuild workflow, do not create `migration.env` on
EC2. Configure the two secret ARNs only in the protected release job, remove
the EC2 instance role's migration-secret access, and deploy application code
with the migration-skip guard described below after the job succeeds.

## 12. Build And Apply Migrations

Run the verification suite before every production deployment:

```sh
npm ci
npm run prisma:generate
npm test
npm run test:api
npm run build:production
```

`build:production` rejects development authentication, placeholder Cognito
values, non-HTTPS redirect URLs, and mismatched callback hosts.

Use `prisma migrate deploy` for production. Never run `migrate dev`,
`migrate reset`, or the test database scripts against production.

The Prisma CLI requires `DATABASE_URL`; it cannot use a Secrets Manager ARN
directly. The protected migration command runs `npm run migrate:production`,
which retrieves `MIGRATION_DATABASE_SECRET_ARN` and `DATABASE_SECRET_ARN`
separately, constructs TLS-validated URLs in memory with `sslmode=require`,
`sslaccept=strict`, and the configured CA certificate, and runs:

```sh
npm run prisma:migrate
```

with only the migration-owner URL in that child process. It never prints either
URL or writes one to disk; this ephemeral implementation detail is not
authorization to configure `DATABASE_URL` on the production host.

For a first manual deployment using the same-EC2 fallback, install and run the
protected one-shot unit after completing the role bootstrap and production
build:

```sh
sudo install -o root -g root -m 0644 \
  deploy/nme-migrate.service /etc/systemd/system/nme-migrate.service
sudo systemctl daemon-reload
sudo systemctl start nme-migrate.service
sudo systemctl --no-pager --full status nme-migrate.service
```

`npm run deploy:ec2:setup` installs this unit for the automated same-host
deployment path. The external-migration setup mode intentionally omits it and
does not grant the deployment user permission to start it. Do not invoke the Prisma CLI directly with runtime
credentials.

After Prisma succeeds, the same command transactionally resets the runtime
role's privileges and grants:

- `CONNECT` (but not `CREATE` or `TEMP`) on the dedicated database;
- `USAGE` (but not `CREATE`) on `public`;
- `SELECT`, `INSERT`, and `UPDATE` on the four catalogue/shared tables:
  `employee`, `site`, `course`, and `medical`;
- `SELECT`, `INSERT`, and `DELETE` on the two assignment tables:
  `site_course_requirement` and `site_medical_requirement`; and
- `SELECT` and `INSERT` on the two completion tables, with `UPDATE` limited to
  their `voided_at`, `voided_by_subject`, and `void_reason` columns.

It grants no sequence privileges; current primary keys use UUID defaults. The
migration owner explicitly gives the runtime role no automatic default table
or sequence privileges. This is intentional: a later migration that adds a
business table must update the migration script's allowlist, rather than
silently exposing that table. Finally, the command opens a new TLS connection
with the runtime secret and verifies the database, role, schema, table, column,
sequence, and migration-history boundaries. Any migration, grant, connection,
or privilege check failure stops deployment before `nme-api` is restarted.

For the recommended protected release workflow, build and test the exact
release commit in CI/CodeBuild, run `npm run migrate:production` there, and
require its migration and runtime-privilege verification to succeed. Only then
deploy the same commit to EC2 with:

```sh
NME_DEPLOY_SKIP_MIGRATIONS=1 NME_SCHEMA_COMPATIBILITY_CONFIRMED=1 \
  NME_EXTERNAL_MIGRATION_COMMIT="$(git rev-parse HEAD)" npm run deploy:ec2
```

The skip flag is a guard for a migration already applied by the protected job;
it is not a way to ignore a pending or failed migration. Record the release
commit and migration-job result together. Apply backward-compatible migrations
before switching application code.

Do not run `npm run prisma:seed` in production unless the decision to load demo
data is deliberate and approved.

## 13. Install The API Service And Nginx

Build the frontend and API, then publish the Vue files:

```sh
sudo rsync -a --delete dist/ /var/www/nme-training/dist/
sudo chown -R nme-training:nme-training /var/www/nme-training
```

Install the provided systemd unit:

```sh
sudo cp deploy/nme-api.service /etc/systemd/system/nme-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now nme-api
sudo systemctl status nme-api
curl http://127.0.0.1:3000/ready
```

### Automated redeployment

The repository includes an opt-in deployment command for the single-EC2
architecture. Run it as the regular user that owns and updates the Git
checkout, not as root:

```sh
cd /opt/nme-training
npm run deploy:ec2:setup
npm run deploy:ec2
```

For the recommended protected CI/CodeBuild migration path, omit the EC2
migration unit and credential entirely:

```sh
NME_EC2_EXTERNAL_MIGRATIONS=1 npm run deploy:ec2:setup
NME_DEPLOY_SKIP_MIGRATIONS=1 NME_SCHEMA_COMPATIBILITY_CONFIRMED=1 \
  NME_EXTERNAL_MIGRATION_COMMIT="$(git rev-parse HEAD)" npm run deploy:ec2
```

The external migration job must have succeeded for this exact commit before
the second command runs. External mode persists in local Git configuration and
disables post-merge/post-checkout auto-deployment; every application deploy
must carry its approved exact-commit migration receipt.

The setup command installs the API and frontend units plus, in same-host mode,
the migration unit. It grants the deployment user passwordless access only to
start or restart the installed units, and
sets this checkout's `core.hooksPath` to `.githooks`. The branch checked out
during setup is stored as the only automatic deployment branch. Setup also
normalizes ownership of existing frontend assets so the publisher can replace
files left by an earlier root-owned deployment.

In same-host migration mode, either pull normally and let the `post-merge`
hook deploy:

```sh
git pull --ff-only
```

or use the explicit update command:

```sh
npm run deploy:ec2:update
```

In external-migration mode, those hooks intentionally do not deploy and the
generic update command is not sufficient. Pull without auto-deploy, wait for
the protected migration receipt for the resulting commit, and run:

```sh
NME_SKIP_AUTO_DEPLOY=1 git pull --ff-only
NME_DEPLOY_SKIP_MIGRATIONS=1 NME_SCHEMA_COMPATIBILITY_CONFIRMED=1 \
  NME_EXTERNAL_MIGRATION_COMMIT="$(git rev-parse HEAD)" npm run deploy:ec2
```

The deployment refuses a dirty worktree, prevents concurrent runs, installs
from `package-lock.json`, runs tests, builds both applications, applies
production migrations (unless the protected-job guard is explicitly set),
restarts and health-checks the API, and only then publishes the frontend.
Successful commit IDs are stored in the ignored
`.deployment/deployments.log`. Set `NME_DEPLOY_SKIP_MIGRATIONS=1` only when the
protected migration job has already succeeded for this exact release commit.

If a release changes a file under `deploy/*.service`, rerun
`npm run deploy:ec2:setup` once so the root-owned systemd copy is refreshed.
Use `NME_EC2_EXTERNAL_MIGRATIONS=1` again when that is the selected deployment
architecture.

Use annotated Git tags for releases. To redeploy an earlier application
version, first verify that its code remains compatible with all migrations
already applied to production. In particular, confirm that no applied migration
removed or changed a table, column, constraint, or payload the older API
requires, and exercise the rollback artifact against a current-schema staging
copy. The Medical migration is additive, so a preceding application release
that ignores the new tables is schema-compatible once this check passes.

Do not rerun migrations during an application-only rollback. From a rollback
target whose deployment driver supports the guard, run:

```sh
NME_SKIP_AUTO_DEPLOY=1 git switch --detach RELEASE_TAG_OR_COMMIT
NME_DEPLOY_ALLOW_REF=1 NME_DEPLOY_SKIP_MIGRATIONS=1 \
  NME_SCHEMA_COMPATIBILITY_CONFIRMED=1 \
  NME_EXTERNAL_MIGRATION_COMMIT="$(git rev-parse HEAD)" npm run deploy:ec2
```

An older tag may predate `NME_DEPLOY_SKIP_MIGRATIONS`. In that case, use the
retained rollback-aware deployment driver from this release or deploy the
previous immutable frontend/API artifact manually; do not run the legacy
deployment command and assume it honors an unknown environment variable. Keep
deployment tooling outside versioned application artifacts in a mature release
pipeline.

Return to the production branch with the same guard, then deploy it:

```sh
NME_SKIP_AUTO_DEPLOY=1 git switch main
NME_DEPLOY_SKIP_MIGRATIONS=1 NME_SCHEMA_COMPATIBILITY_CONFIRMED=1 \
  NME_EXTERNAL_MIGRATION_COMMIT="$(git rev-parse HEAD)" npm run deploy:ec2
```

The final skip above is valid only while the production branch identifies the
same already-applied schema release. If it contains a newer pending migration,
run the protected migration job first or omit the flag in the same-host
workflow.

Set `NME_DEPLOY_FORCE=1` only when the same commit must be rebuilt, such as
after correcting the ignored `.env.production` file. The API deployment is
completed before frontend publication, so a failed API health check leaves the
previous frontend in place. Database migrations are not automatically rolled
back.

Assign an Elastic IP to EC2. Create the production hostname's DNS `A` record
pointing to that address and wait until public DNS returns the Elastic IP.
Ports 80 and 443 must be open in the EC2 security group.

Replace `training.example.com` in the bootstrap configuration, install it, and
start HTTP:

```sh
sed 's/training\.example\.com/training.your-company-domain.com/g' \
  deploy/nme-training.bootstrap.nginx.conf |
  sudo tee /etc/nginx/conf.d/nme-training.conf >/dev/null
sudo nginx -t
sudo systemctl enable --now nginx
curl http://training.your-company-domain.com/api/v1/ready
```

Obtain the certificate with the webroot challenge:

```sh
sudo certbot certonly --webroot \
  --webroot-path /var/www/certbot \
  --domain training.your-company-domain.com
```

Replace the bootstrap configuration with the HTTPS configuration:

```sh
sed 's/training\.example\.com/training.your-company-domain.com/g' \
  deploy/nme-training.nginx.conf |
  sudo tee /etc/nginx/conf.d/nme-training.conf >/dev/null
sudo nginx -t
sudo systemctl reload nginx
curl https://training.your-company-domain.com/api/v1/ready
sudo certbot renew --dry-run
```

Do not enable HSTS until HTTPS works on the intended hostname. The supplied
final configuration enables it.

## 14. Pre-Launch Validation

Use a staging environment first. It should have a different:

- hostname;
- Cognito user pool or app client;
- RDS database;
- Secrets Manager runtime and migration secrets; and
- environment configuration.

Validate:

1. Linked employee login succeeds, shows only that employee, and `/manage` is rejected.
2. Administrator login succeeds.
3. Employee create, edit, archive, and restore work.
4. Pending active employees show Invitation pending and can receive a replacement invitation.
5. Confirmed, disabled, missing, mismatched, and archived employee accounts cannot resend invitations.
6. A Cognito lookup failure shows account status as unavailable without hiding employee records.
7. Site archive and restore preserve course and medical assignments.
8. Course and Medical create/edit atomically replace site assignments.
9. Completion expiry is calculated from Course or Medical validity.
10. January 31 expiry clamps correctly in February.
11. Renewal and void workflows work.
12. Course and Medical archive/restore preserve and suspend site assignments.
13. Expired access tokens return `401`.
14. Employee broad-read and mutation requests return `403`.
15. The browser never receives database credentials or temporary passwords.
16. RDS is not publicly reachable.
17. The API is not reachable directly on port 3000.
18. A backup can be restored into a separate RDS instance.
19. A previous application release passes current-schema compatibility checks
    and can be redeployed without starting the migration service.
20. The migration creates empty Medical tables without changing Course counts
    or Training readiness.
21. The runtime role can manage Medical catalogue records and assignments and
    can insert/void Medical completions, but cannot change immutable completion
    facts or delete completion history; the migration service uses
    migration-owner credentials.
22. The migration unit refuses shared migration/runtime roles, verifies the
    eight-table runtime allowlist, and completes before the API is restarted.
23. The database is dedicated to this application, all Prisma objects are in
    `public`, and the migration role owns the database, schema, history, tables,
    and sequences.
24. The API service has no direct `DATABASE_URL` and cannot read
    `migration.env`; the dedicated migration identity is not used by the API.
25. When CI/CodeBuild runs migrations, the EC2 role cannot retrieve the
    migration secret and the exact application commit deploys with the
    migration-skip guard only after the protected job succeeds.

## 15. Monitoring And Alerts

Install and configure the CloudWatch agent.

Collect:

- `nme-api` systemd logs;
- Nginx access and error logs;
- CPU, memory, disk, and status-check metrics;
- RDS CPU, storage, connections, latency, and availability metrics; and
- application `5xx` responses.

Create alarms for:

- API service stopped;
- EC2 status-check failure;
- sustained high CPU or memory;
- low disk space;
- RDS low free storage;
- high database connections;
- RDS CPU or latency;
- backup failure;
- repeated `5xx` responses; and
- certificate expiration when not using an automatically managed certificate.

Set log retention explicitly. Avoid indefinite retention unless required.

## 16. Backup, Recovery, And Rollback

Use:

- RDS automated backups and point-in-time recovery;
- a manual snapshot before a high-risk migration;
- termination protection/deletion protection;
- tested restore instructions; and
- an application artifact for every release.

Application rollback:

1. Stop traffic-changing work.
2. Compare the target artifact with every migration already recorded in
   `_prisma_migrations`, and verify it against a current-schema staging copy.
3. Redeploy the previous frontend and API artifact with
   `NME_DEPLOY_SKIP_MIGRATIONS=1`; do not attempt to reverse or reapply the
   schema as part of an application rollback.
4. Restart `nme-api`.
5. Verify health plus employee, Training, Medical, and management workflows.

Use the migration-skip guard only after the compatibility check. If the target
deployment driver predates that flag, use the retained current driver or a
manual immutable-artifact procedure that does not start
`nme-migrate.service`.

Database rollback is not normally `migrate reset` or an edited migration.
Prefer forward-fix migrations. For destructive failure, restore RDS to a new
instance, validate it, then deliberately switch the application secret or
endpoint.

## 17. Recommended Delivery Sequence

Use this order:

1. Run the complete stack locally.
2. Create staging RDS and verify the migration.
3. Create staging Cognito and test employee, admin, and owner roles.
4. Deploy staging EC2, Nginx, Fastify, and Vue.
5. Run integration and Playwright tests against staging.
6. Add CloudWatch, alarms, backups, and restore testing.
7. Install the RDS root CA selected by the database.
8. Create the dedicated production database and bootstrap its distinct
   migration/runtime roles and ownership.
9. Create production secrets, Cognito, EC2, DNS, and TLS; do not configure a
   direct production `DATABASE_URL`.
10. Apply the production migration in the protected release job (recommended)
    or the dedicated same-EC2 migration unit.
11. Deploy the exact application commit, using the migration-skip guard only
    after the protected job succeeds.
12. Create the sole owner manually, then invite the first administrator.
13. Run the pre-launch checklist.
14. Import or enter real data.
15. Open access to the intended users.
16. Monitor closely and keep the previous release artifact and rollback-aware
    deployment driver available.

## 18. Items Still Needed Before Production

The application feature implementation is substantially ready, but the
production platform is not yet complete. Before launch, complete:

- a protected CI/CodeBuild migration job with its own IAM role (recommended),
  or a documented risk acceptance for the weaker same-EC2 fallback;
- real Cognito and domain values;
- staging;
- CloudWatch logs and alarms;
- tested RDS restore;
- an explicit decision on Single-AZ versus Multi-AZ and single-EC2 versus
  load-balanced availability.
