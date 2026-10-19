# One backend for Sales, Manager and Admin

Run the frontend on http://localhost:3000 and one backend on http://localhost:4000. Remove `NEXT_PUBLIC_MANAGER_API_URL` and `NEXT_PUBLIC_ADMIN_API_URL`; the application no longer reads them. No processes on ports4101/4102 are needed.

In `backend/.env`, keep your existing MySQL credentials and set:

```ini
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000
DEV_AUTH_ENABLED=true
DEV_ACTOR=sales
```

In `frontend/.env.local`:

```ini
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_ENABLE_DEMO_WORKSPACES=true
```

From a terminal (Windows PowerShell, macOS or Linux), with Docker running:

```sh
cd backend
docker compose up -d --build
```

Only on a new database, apply migrations and add sample masters:

```sh
docker compose exec backend npm run migrate
docker compose exec backend npm run seed:teams
docker compose exec backend npm run seed:customers
docker compose exec backend npm run seed:orders
```

In another terminal from the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000. Select Sales, Manager or Admin using the development workspace selector. The browser always calls port4000. Manager approval requires a different submitter and valid team access. Admin exposes customer and team management actions. Refresh retains the selected role; switching discards the previous role’s query cache. Dirty forms still ask before switching.

`GET /api/v1/dev/session` reads the selected development workspace; `POST` with `{ "workspace": "manager" }` (or sales/admin) changes it. A signed HttpOnly, SameSite=Lax cookie carries the selection. The POST checks the configured frontend Origin. No arbitrary role headers are accepted, trusted `req.user` takes precedence, and these endpoints are unavailable when development authentication is disabled or in production. `DEV_ACTOR` is the fallback identity for clients without this cookie, including direct Postman/CLI calls; set it to admin if deliberately running direct Admin-only API tests without the browser session.

Use the same hostname in browser/API settings (`localhost` in this example). If the frontend port changes, update `FRONTEND_URL` and recreate the backend container. Readiness: http://localhost:4000/api/ready. Stop any previous standalone Manager/Admin terminals; they are not used by this setup.
