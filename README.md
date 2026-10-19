# ERP

One Git repository containing two independent Node.js applications. Each app has its own `package.json`, lockfile, dependencies, and commands. There is no root package or workspace installation required.

```text
erp/
├── backend/              # Express API, port 4000
│   ├── src/
│   ├── .env.example
│   └── package.json
├── frontend/             # Next.js App Router, port 3000
│   ├── src/app/
│   ├── .env.example
│   └── package.json
├── .gitignore
└── README.md
```

## Requirements

Node.js 22.13+ on the 22.x release line, or Node.js 24+, and npm. If you use nvm, run `nvm use` from the repository root.

## Run the backend

In one terminal, from the repository root:

```sh
cd backend
cp .env.example .env
npm ci
npm run dev
```

API health: <http://localhost:4000/api/health>

Database readiness: <http://localhost:4000/api/ready>. Start MySQL with Docker (see below) for this check to pass.

`npm start` runs the API without watch mode. `npm run check` checks JavaScript syntax.

## Run the backend with Docker

Install Docker with Docker Compose and start the Docker engine. From the repository root:

```sh
cd backend
cp .env.example .env
# Edit .env and choose separate MySQL application and root passwords.
docker compose up --build -d
```

The API is available at <http://localhost:4000/api/health>. The frontend still runs separately using its own commands.

Compose starts the backend and MySQL together, waiting for MySQL to become healthy before starting the backend. Copy the example environment file only on first setup; preserve any existing `.env`. Customize `PORT` and `FRONTEND_URL` in `.env` as needed. Compose maps the backend's selected port on both the host and container. Environment files and local `node_modules` are excluded from the image. Add any future backend variables explicitly to the backend service's `environment` section in `compose.yaml`.

From `backend/`:

```sh
docker compose logs -f backend
docker compose ps
docker compose down
```

After changing source code, rebuild with `docker compose up --build -d`. After changing environment values, run `docker compose up -d` to recreate the container.

You can also build and run the image directly from the repository root:

```sh
docker build -t erp-backend ./backend
docker run --rm --init -p 4000:4000 --env-file backend/.env erp-backend
```

The direct `docker run` command requires `backend/.env`; omit `--env-file backend/.env` to use the image defaults. If you change `PORT`, update the port mapping accordingly. The image installs production dependencies, runs as the `node` user, and checks `/api/health` for container health.

## MySQL in Docker

MySQL runs only in Docker using the official `mysql:8.4` image. No local MySQL installation is required. Configure the database name, application user, passwords, and local port in `backend/.env` using `.env.example` as a reference.

To run just the database, from `backend/`:

```sh
docker compose up -d --wait mysql
```

To open a SQL shell with the application user (enter `MYSQL_PASSWORD` when prompted):

```sh
docker compose exec mysql sh -c 'exec mysql --user="$MYSQL_USER" --password "$MYSQL_DATABASE"'
```

Use `SHOW TABLES;` to inspect the selected database or `SELECT 1;` to check access.

| Connection | Host | Port |
| --- | --- | --- |
| Backend container | `mysql` | `3306` |
| Local database tool or locally running backend | `127.0.0.1` | `MYSQL_PORT` (default `3306`) |

Compose provides `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` to the backend container. For a locally running backend, the connection defaults to `127.0.0.1` and reads `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD` from `backend/.env`. Explicit `DB_*` values take precedence. MySQL continues to run in Docker. Application tables are not created automatically.

## API health and database readiness

| Endpoint | Check | Response |
| --- | --- | --- |
| `GET /api/health` | Express is responding | `200` with `status: "ok"` |
| `GET /api/ready` | Connect to the configured MySQL database and run `SELECT 1` | `200` with `status: "ready"`, or `503` with `status: "not_ready"` |

```sh
curl -i http://localhost:4000/api/ready
```

Successful response:

```json
{"status":"ready","checks":{"database":"ok"}}
```

When MySQL cannot be reached, rejects the credentials, or the check fails:

```json
{"status":"not_ready","checks":{"database":"unavailable"}}
```

Readiness responses disable caching and do not expose database error details. The MySQL connection pool uses a 3-second connection timeout, a 3-second query timeout, and fails immediately if all five connections are busy. Connections are closed during backend shutdown. `npm test` in `backend/` checks readiness success, failure, recovery, and independent API liveness without requiring a running database.

The backend Docker health check continues to call `/api/health`. Use `/api/ready` for load balancer or deployment readiness checks, and the MySQL service's Docker health check for the database container itself.

Database files persist in the `mysql_data` named volume across restarts, rebuilds, and `docker compose down`. Avoid `docker compose down -v` unless you intend to delete the database. Initialization variables create the database and user only when the data volume is empty; changing passwords in `.env` does not update an existing database user's password. These behaviors follow the [official MySQL image configuration](https://hub.docker.com/_/mysql/).

## Run the frontend

In another terminal, from the repository root:

```sh
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

Open <http://localhost:3000/orders/quotations>. The quotation workspace includes list, create/edit, details, approval, issue, buyer response, revisions, PDF download and conversion to a Draft sales order. Set up the quotation database and development actor as described below. See [frontend setup and architecture](frontend/README.md) for environment variables, feature structure and tests.

`npm run lint` checks the frontend. For production, run `npm run build` followed by `npm start` inside `frontend/`.

## Environment variables

| App | Variable | Default | Purpose |
| --- | --- | --- | --- |
| Backend | `PORT` | `4000` | API listening port |
| Backend | `FRONTEND_URL` | `http://localhost:3000` | Allowed browser origin for CORS |
| Frontend | `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API base URL, without a trailing slash |

For deployment, set these to your deployed origins. The API URL is public and included in the frontend at build time; set it before `npm run build`. Restart development servers after changing environment files. Keep secrets out of `NEXT_PUBLIC_` variables. Local environment files are ignored by Git; example files are committed.

## Store both apps in one GitHub repository

Git is initialized at the root, so both apps belong to the same repository. Create an empty repository on GitHub, then run from this folder (replace the URL):

```sh
git add .
git commit -m "Initialize Express backend and Next.js frontend"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Do not initialize separate Git repositories inside the app folders. When deploying, use `backend/` and `frontend/` as the respective service root directories.

## Quotation backend

The quotation module adds exactly 15 operations under `/api/v1/quotations`, Sequelize migrations/seed data, team authorization, revision lifecycle, PDF and idempotent conversion to a Draft sales order. See [setup, schema, commands and UI integration](backend/docs/quotations.md) and the [OpenAPI contract](backend/docs/quotations.openapi.yaml).

From `backend/`, run `npm run migrate`, `npm run seed`, then `DEV_AUTH_ENABLED=true DEV_ACTOR=sales npm run dev` for local development. `npm run demo` runs the full two-actor HTTP happy path. For MySQL integration tests use a separately provisioned database: `TEST_DB_NAME=erp_quotation_test npm test`. The development principal is disabled by default and rejected at production startup when enabled; production requires trusted authentication middleware.

## Sales Orders backend

The next Orders module adds 15 Sales Orders APIs for direct and quotation-converted Drafts, manager confirmation, queued handoff, hold/resume, immutable operational amendments, per-line fulfilment and PDF history. See [setup and contracts](backend/docs/sales-orders.md), [screen/API journeys](backend/docs/sales-orders-ui-integration.md), [OpenAPI](backend/docs/sales-orders.openapi.yaml) and [reference DDL](backend/docs/sales-orders.schema.sql). The frontend Sales Orders workspace is at `/orders/sales-orders`; see its [testing guide](frontend/docs/sales-order-testing-guide.md). Production fulfilment transport remains an external integration.

Customers backend provides six scoped buyer-master APIs with versioned nested contacts/addresses, idempotent create, archive/reactivate and quotation/order concurrency guards. See [Customers setup](backend/docs/customers.md), [screen/API journeys](backend/docs/customers-ui-integration.md), [testing guide](backend/docs/customers-verification.md), [OpenAPI](backend/docs/customers.openapi.yaml) and [Postman collection](backend/docs/postman/customers.postman_collection.json). Customers list/create/profile/edit screens are integrated under Orders → Customers; see [frontend journeys](frontend/docs/customers-journeys.md).

Sales Teams backend adds six team-master APIs with versioned complete membership sets, manager validation, archive/reactivate, current membership scope checks and assignment guards. Separate staff lookup and explicit customer/document reassignment APIs support blocker resolution. See [implementation and permissions](backend/docs/sales-teams.md), [frontend screen/API mapping](backend/docs/sales-teams-ui-integration.md), [testing guide](backend/docs/sales-teams-verification.md), [OpenAPI](backend/docs/sales-teams.openapi.yaml) and [Postman](backend/docs/postman/sales-teams.postman_collection.json). Sales Teams list/create/profile/edit screens are integrated under Orders → Sales teams, including staff selection, membership history, assignment transfers and lifecycle dialogs. See [frontend journeys and screen/API mapping](frontend/docs/sales-teams-journeys.md).
