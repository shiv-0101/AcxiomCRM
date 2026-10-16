# AcxiomCRM

AcxiomCRM is a local-first customer relationship workspace for sales teams. It combines customer records, leads, opportunity pipeline, follow-ups, role-aware access, audit logging, and a dashboard backed by SQLite.

## Current implementation

- Responsive React/Vite workspace with authenticated login, dashboard KPIs, pipeline chart, follow-up agenda, searchable record tables, and create flows.
- Express API with JWT authentication, role-based scoping, validation, rate limiting, security middleware, audit logs, and SQLite schema/seed data.
- External integrations are intentionally unconfigured. No API keys or private service credentials are required for local CRM workflows.

## Architecture and implementation guide

### Frontend

The frontend is a React 19 and TypeScript application built with Vite. `frontend/src/App.tsx` owns the authenticated workspace shell and composes the dashboard, record tables, create dialogs, responsive navigation, and login screen. API access is centralized in `frontend/src/api/client.ts`; the Axios interceptor attaches the JWT stored in `localStorage` and redirects expired sessions to login. `frontend/src/contexts/AuthContext.tsx` owns login, logout, session restoration, and role checks. Styling is intentionally kept in `frontend/src/App.css` and `frontend/src/index.css` so the visual system can be adjusted without changing API logic.

The current user flows are:

1. Sign in with a seeded or configured account.
2. View role-scoped dashboard KPIs, pipeline value, and upcoming follow-ups.
3. Search customers, leads, opportunities, and follow-ups.
4. Create records through validated backend requests.
5. Move between workspace sections using the responsive sidebar.

### Backend

The backend is an Express application. `backend/src/server.js` initializes SQLite, seeds development data, and starts the HTTP server. `backend/src/app.js` configures Helmet, CORS, JSON parsing, compression, request logging, rate limits, the health endpoint, routes, and centralized errors.

Routes are separated by business area:

- `/api/auth` handles login, logout, registration, and the current user.
- `/api/dashboard` returns role-scoped KPIs and chart data.
- `/api/customers`, `/api/leads`, `/api/opportunities`, and `/api/followups` provide CRUD workflows.
- `/api/activities` stores interaction history.
- `/api/users` provides administrative user management.
- `/api/reports` provides pipeline, conversion, audit, and activity reports.

Protected routes use JWT authentication from `backend/src/middleware/auth.js`. Sales executives are scoped to their assigned records; managers and administrators can access broader team data. Request validation uses `express-validator`, and mutations write audit entries through `backend/src/utils/auditLog.js`.

### Database and seed data

SQLite schema creation and indexes live in `backend/src/config/database.js`. The first backend start creates `backend/data/acxiomcrm.db`; `backend/src/config/seed.js` then creates roles, demo users, customers, leads, opportunities, follow-ups, and audit records. The database file is ignored by Git and should never be committed.

For production, replace the startup seed behavior with a migration/deployment step and provide a managed database or a durable SQLite volume. Passwords are hashed with `bcryptjs`; JWT signing and database paths are configured through environment variables.

### Adding a new CRM entity

1. Add the table, constraints, and indexes in `backend/src/config/database.js`.
2. Add seed fixtures only when deterministic local data is useful.
3. Create a route module with authentication, validation, role checks, pagination, and consistent `{ success, data, message }` responses.
4. Add the typed domain shape and API methods to `frontend/src/types/index.ts` and `frontend/src/api/client.ts`.
5. Add the smallest UI surface in `frontend/src/App.tsx`, keeping network calls in the API client.
6. Run the backend tests, frontend build, and an authenticated request against the new endpoint.

### External integrations

No external service is called during startup. Integration credentials belong in backend environment variables only. Add a dedicated adapter under `backend/src/integrations/`, define its configuration in `backend/.env.example`, and return an explicit configuration error when required variables are empty. Do not expose private keys through `VITE_*` variables.

### Validation checklist

```powershell
# Terminal 1
cd backend
npm install
npm start

# Terminal 2
cd frontend
npm install
npm run build
npm run dev

# API smoke checks
Invoke-RestMethod http://localhost:5000/api/health
```

After login, verify the dashboard request, a list request, and one create flow. Keep the backend running while using the frontend; a refused request to `localhost:5000` means the API process is not running or its native SQLite dependency did not install successfully.

## Run locally

Prerequisites: Node.js 20+ and npm.

```powershell
cd backend
npm install
npm start
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173  
API health: http://localhost:5000/api/health

The backend creates `backend/data/acxiomcrm.db` and seeds demo data on first start. Demo accounts:

- `admin` / `Admin@123`
- `manager` / `Manager@123`
- `sales1` / `Sales@123`

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env` when customising ports or API URLs. Leave integration variables empty until the relevant service is configured.

## Commands

Frontend: `npm run build`, `npm run lint`  
Backend: `npm test`, `npm run lint`  

## Environment and integrations

Backend configuration lives in `backend/.env.example`, including database path, JWT settings, CORS origin, rate limits, and password policy. The current application has no external provider dependency; future providers should be added behind a backend service adapter and configured only through environment variables.

## Known limitation

The backend uses `better-sqlite3`, which needs a compatible native prebuild or local build toolchain for the selected Node.js version. The frontend build is verified. If backend installation cannot obtain a compatible binary, use a supported Node.js LTS version or install the required native build tools before starting the API.
