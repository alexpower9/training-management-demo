# NME Training Compliance

Internal training-compliance application for Northern Mining Equipment.

## Application Structure

- `src/`: Vue training workspace, Cognito authentication, and restricted Manage placeholder.
- `server/`: Fastify TypeScript API with Cognito JWT verification and Prisma.
- `server/prisma/`: PostgreSQL schema, initial migration, and demo seed.
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

Copy `.env.example` to `.env` for the frontend. Development authentication defaults to an
administrator and training data defaults to the local demo repository.

Start the frontend:

```sh
npm run dev
```

To run the API, configure `server/.env` with a PostgreSQL `DATABASE_URL`, then run:

```sh
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev:api
```

Switch the frontend to the API with:

```sh
VITE_DATA_SOURCE=api npm run dev
```

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
