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
test employee self-service authorization. Set `VITE_DEMO_ROLE` to `owner` to
test account linking and administrator invitations.

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
`ca-central-1` is already the repository default.

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

Use separate credentials:

- a migration owner that can create extensions, tables, indexes, and
  constraints; and
- an application user used by Fastify at runtime.

The application user should have:

- `CONNECT` on the database;
- `USAGE` on the application schema;
- `SELECT`, `INSERT`, and `UPDATE` on the five business tables; and
- `DELETE` on `site_course_requirement` so course edits can replace assignments;
- no `DELETE` permission on the other business tables; and
- no schema-change permission.

Database migrations must run as the migration owner, not as the application
user.

## 7. Store Database Credentials

Create Secrets Manager secrets containing JSON with:

```json
{
  "username": "nme_training_app",
  "password": "generated-password",
  "host": "database.abc123.ca-central-1.rds.amazonaws.com",
  "port": 5432,
  "dbname": "nme_training"
}
```

Create a separate migration secret for the migration owner.

Attach an IAM role to EC2 through an instance profile. Grant only:

- `secretsmanager:GetSecretValue` for the application secret;
- `kms:Decrypt` if the secret uses a customer-managed KMS key;
- `cognito-idp:ListUsersInGroup`, `cognito-idp:AdminCreateUser`,
  `cognito-idp:AdminAddUserToGroup`, and `cognito-idp:AdminDeleteUser` for this
  application's user-pool ARN;
- Systems Manager permissions; and
- CloudWatch log and metric permissions.

Do not store AWS access keys on EC2. The AWS SDK automatically uses the
instance-role credentials.

The API reads `DATABASE_SECRET_ARN` at startup. After a database-secret
rotation, restart the API service so it creates a new pool with the current
credentials.

## 8. Require And Validate Database TLS

RDS supports encrypted PostgreSQL connections and publishes a regional/global
CA bundle.

Before launch:

1. Install the current RDS CA bundle on the EC2 instance.
2. Configure Prisma with `sslmode=require`, the RDS root certificate, and
   strict certificate checking.
3. Test the RDS endpoint hostname against the certificate.
4. Document CA rotation as an operational task.

The current Secrets Manager URL builder requires encryption with
`sslmode=require`, but it does not yet supply the RDS root certificate or
strict certificate validation. Treat this as a production launch blocker, not
as an optional refinement.

## 9. Configure Amazon Cognito

Create one Cognito user pool for production.

Recommended settings:

1. Disable public self-registration for this internal application.
2. Choose the required sign-in identifier, normally email.
3. Require a strong password policy.
4. Enable MFA according to company policy; MFA is strongly recommended for
   administrators.
5. Create a Cognito managed-login domain.
6. Create a public browser app client with no client secret.
7. Enable only the authorization-code OAuth grant.
8. Enable PKCE.
9. Allow scopes `openid`, `profile`, and `email`.
10. Register the exact callback URL:
    `https://training.your-company-domain.com/auth/callback`.
11. Register the exact sign-out URL:
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

After creating an employee Cognito account, copy its immutable `sub` value and
link it from Manage Employees while signed in as the owner. Regular
administrators cannot view or change account links. Email and display name are
not authorization keys. An employee cannot access training data until this
link exists, and an archived employee remains denied until restored.

The owner can invite administrators from Manage Administrators. The API uses
its EC2 role to call Cognito, creates the user, and adds it only to the
hardcoded `admin` group. There is no API operation that can create another
owner.

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
sudo dnf install -y git nginx nodejs24 nodejs24-npm
sudo alternatives --set node /usr/bin/node-24
node --version
npm --version
```

Create the service account and directories:

```sh
sudo useradd --system --home-dir /opt/nme-training --shell /sbin/nologin nme-training
sudo mkdir -p /opt/nme-training /var/www/nme-training /etc/nme-training
sudo chown -R nme-training:nme-training /opt/nme-training
```

Deploy source or a CI-built artifact to `/opt/nme-training`. Production should
use `npm ci`, never an unpinned `npm install`.

## 11. Production Environment Values

Frontend values are compiled into the Vue bundle. Create a temporary
`.env.production` during the build:

```dotenv
VITE_AUTH_MODE=cognito
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=/api/v1
VITE_COGNITO_AUTHORITY=https://cognito-idp.ca-central-1.amazonaws.com/POOL_ID
VITE_COGNITO_CLIENT_ID=APP_CLIENT_ID
VITE_COGNITO_DOMAIN=https://YOUR_DOMAIN.auth.ca-central-1.amazoncognito.com
VITE_COGNITO_REDIRECT_URI=https://training.your-company-domain.com/auth/callback
VITE_COGNITO_POST_LOGOUT_REDIRECT_URI=https://training.your-company-domain.com/training
```

These frontend values are identifiers and URLs, not secrets. Never put a
Cognito client secret or database credential in a `VITE_*` variable.

Create `/etc/nme-training/api.env`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
AUTH_MODE=cognito
COGNITO_USER_POOL_ID=ca-central-1_POOL_ID
COGNITO_CLIENT_ID=APP_CLIENT_ID
DATABASE_SECRET_ARN=arn:aws:secretsmanager:ca-central-1:ACCOUNT_ID:secret:SECRET_NAME
AWS_REGION=ca-central-1
```

Protect it:

```sh
sudo chown root:nme-training /etc/nme-training/api.env
sudo chmod 640 /etc/nme-training/api.env
```

## 12. Build And Apply Migrations

Run the verification suite before every production deployment:

```sh
npm ci
npm run prisma:generate
npm test
npm run test:api
npm run build:all
```

Use `prisma migrate deploy` for production. Never run `migrate dev`,
`migrate reset`, or the test database scripts against production.

The Prisma CLI requires `DATABASE_URL`; it cannot use
`DATABASE_SECRET_ARN` through the API startup helper. The deployment process
must retrieve the migration secret into the deployment process, construct the
TLS-validated migration URL in memory, run:

```sh
npm run prisma:migrate
```

and then discard the environment value. Do not print the URL or write it to the
repository.

For future releases, make `prisma migrate deploy` a protected CI/CD release
step. Apply backward-compatible migrations before switching application code.

Do not run `npm run prisma:seed` in production unless the decision to load demo
data is deliberate and approved.

## 13. Install The API Service And Nginx

Build the frontend and API, then publish the Vue files:

```sh
sudo rsync -a --delete dist/ /var/www/nme-training/dist/
sudo chown -R nginx:nginx /var/www/nme-training
```

Install the provided systemd unit:

```sh
sudo cp deploy/nme-api.service /etc/systemd/system/nme-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now nme-api
sudo systemctl status nme-api
curl http://127.0.0.1:3000/health
```

Replace every `training.example.com` value in
`deploy/nme-training.nginx.conf`, then install it in the Nginx configuration.

For the current direct-EC2 architecture, obtain and automatically renew a
public TLS certificate for the production hostname. Test renewal before
launch.

Then:

```sh
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

Create the DNS record only after HTTPS and API health checks work against the
instance.

## 14. Pre-Launch Validation

Use a staging environment first. It should have a different:

- hostname;
- Cognito user pool or app client;
- RDS database;
- Secrets Manager secret; and
- environment configuration.

Validate:

1. Linked employee login succeeds, shows only that employee, and `/manage` is rejected.
2. Administrator login succeeds.
3. Employee create, edit, archive, and restore work.
4. Site archive and restore preserve course assignments.
5. Course create and edit atomically replace site assignments.
6. Completion expiry is calculated from course validity.
7. January 31 expiry clamps correctly in February.
8. Renewal and void workflows work.
9. Course archive and restore preserve and suspend site assignments.
10. Expired access tokens return `401`.
11. Employee broad-read and mutation requests return `403`.
12. The browser never receives database credentials.
13. RDS is not publicly reachable.
14. The API is not reachable directly on port 3000.
15. A backup can be restored into a separate RDS instance.
16. A previous application release can be redeployed.

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
2. Redeploy the previous frontend and API artifact.
3. Restart `nme-api`.
4. Verify health and core workflows.

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
7. Correct the database certificate-validation launch blocker.
8. Create production RDS, secrets, Cognito, EC2, DNS, and TLS.
9. Apply the production migration.
10. Create the sole owner manually, then invite the first administrator.
11. Run the pre-launch checklist.
12. Import or enter real data.
13. Open access to the intended users.
14. Monitor closely and keep the previous release artifact available.

## 18. Items Still Needed Before Production

The application feature implementation is substantially ready, but the
production platform is not yet complete. Before launch, complete:

- Docker/PostgreSQL-backed integration and Playwright runs;
- strict RDS CA validation;
- a protected migration-secret workflow;
- real Cognito and domain values;
- staging;
- CloudWatch logs and alarms;
- tested RDS restore;
- deployment automation or a documented manual release procedure; and
- an explicit decision on Single-AZ versus Multi-AZ and single-EC2 versus
  load-balanced availability.
