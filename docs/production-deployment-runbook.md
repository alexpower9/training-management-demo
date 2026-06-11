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
  "host": "database.abc123.us-east-1.rds.amazonaws.com",
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

Administrators and owners add employees from Manage Employees with a display
name and email. The API creates the Cognito user with delivery suppressed, adds
it only to the `employee` group, stores its immutable `sub`, and then requests
the standard temporary-password email. Email and display name are not
authorization keys, and Cognito subjects are never returned by management API
responses. An archived employee remains denied until restored.

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

Cognito rejects an invitation template that omits `{####}`. Keep the
application sign-in URL environment-specific and verify delivery in staging
for both employee and administrator invitations.

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
sudo useradd --system --home-dir /opt/nme-training --shell /sbin/nologin nme-training
sudo mkdir -p /opt/nme-training /var/www/nme-training /var/www/certbot /etc/nme-training
sudo chown -R "$USER":nme-training /opt/nme-training
sudo chmod 0750 /opt/nme-training
```

Deploy source or a CI-built artifact to `/opt/nme-training`. Production should
use `npm ci`, never an unpinned `npm install`. The regular EC2 deployment user
owns the checkout; the `nme-training` service group has read access.

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

The Prisma CLI requires `DATABASE_URL`; it cannot use
`DATABASE_SECRET_ARN` through the API startup helper. The deployment process
must retrieve the migration secret into the deployment process, construct the
TLS-validated migration URL in memory with `sslmode=require`,
`sslaccept=strict`, and `sslcert=/etc/pki/rds/rds-ca-rsa2048-g1.pem`, run:

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
sudo chown -R nme-training:nme-training /var/www/nme-training
```

Install the provided systemd unit:

```sh
sudo cp deploy/nme-api.service /etc/systemd/system/nme-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now nme-api
sudo systemctl status nme-api
curl http://127.0.0.1:3000/health
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

The setup command installs three fixed-purpose systemd units, grants the
deployment user passwordless access only to start or restart those units, and
sets this checkout's `core.hooksPath` to `.githooks`. The branch checked out
during setup is stored as the only automatic deployment branch. Setup also
normalizes ownership of existing frontend assets so the publisher can replace
files left by an earlier root-owned deployment.

After setup, either pull normally and let the `post-merge` hook deploy:

```sh
git pull --ff-only
```

or use the explicit update command:

```sh
npm run deploy:ec2:update
```

The deployment refuses a dirty worktree, prevents concurrent runs, installs
from `package-lock.json`, runs tests, builds both applications, applies
production migrations, restarts and health-checks the API, and only then
publishes the frontend. Successful commit IDs are stored in the ignored
`.deployment/deployments.log`.

If a release changes a file under `deploy/*.service`, rerun
`npm run deploy:ec2:setup` once so the root-owned systemd copy is refreshed.

Use annotated Git tags for releases. To redeploy an earlier application
version, first verify that its code remains compatible with all migrations
already applied to production, then run:

```sh
NME_SKIP_AUTO_DEPLOY=1 git switch --detach RELEASE_TAG_OR_COMMIT
NME_DEPLOY_ALLOW_REF=1 npm run deploy:ec2
```

Return to the production branch with the same guard, then deploy it:

```sh
NME_SKIP_AUTO_DEPLOY=1 git switch main
npm run deploy:ec2
```

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
7. Install the RDS root CA selected by the database.
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

- a protected migration-secret workflow;
- real Cognito and domain values;
- staging;
- CloudWatch logs and alarms;
- tested RDS restore;
- an explicit decision on Single-AZ versus Multi-AZ and single-EC2 versus
  load-balanced availability.
