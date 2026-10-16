# AxiomCRM

AxiomCRM is a full-stack customer relationship workspace for sales teams. It brings customer records, leads, opportunities, follow-ups, role-based access, audit logging, and pipeline analytics into one local-first application.

## Screenshots

View the application screenshots here:

[Open the AxiomCRM screenshots](https://docs.google.com/document/d/1M1eGn83xrAyO79fZErNv_ufPJt91Ffq4U9Ipog1mv0g/edit?usp=sharing)

## Features

- JWT login, logout, registration, password hashing, account lockout, and protected API routes
- Role-aware access for `Admin`, `Manager`, and `SalesExecutive`
- Customer, lead, opportunity, and follow-up CRUD workflows
- Soft deactivation for records where permanent deletion is unsafe
- Client-side and server-side validation
- Lead, opportunity, and follow-up business rules
- Dashboard KPI cards, upcoming follow-ups, and a Chart.js pipeline chart
- Search and filtering through API-backed record views
- Audit entries for important create, update, delete, login, role, and password operations
- SQLite development database with deterministic seed data
- Security middleware, CORS configuration, rate limits, centralized errors, and request logging

## Technology

- Frontend: React 19, TypeScript, Vite, Axios, Chart.js, React Hook Form, Lucide icons
- Backend: Node.js, Express, JWT, bcryptjs, express-validator, Helmet, compression, Winston
- Database: SQLite through `better-sqlite3`
- Tests: Jest and Supertest

## Repository structure

```text
AxiomCRM/
├── backend/
│   ├── src/
│   │   ├── config/          Database schema and seed data
│   │   ├── middleware/      Authentication, authorization, and errors
│   │   ├── routes/          REST API modules and request handlers
│   │   └── utils/            Logging and audit helpers
│   └── tests/               API acceptance tests
├── frontend/
│   ├── src/
│   │   ├── api/             Centralized Axios API client
│   │   ├── contexts/        Authentication state
│   │   ├── types/           Frontend domain contracts
│   │   └── App.tsx          Workspace UI and CRM workflows
│   └── public/
├── README.md
└── .gitignore
```

## Requirements

- Node.js 20 or newer
- npm
- A compatible native build environment for `better-sqlite3` when a prebuilt binary is unavailable

## Run locally

### 1. Start the backend

```powershell
cd backend
npm install
npm start
```

The API runs at `http://localhost:5000` and creates `backend/data/acxiomcrm.db` on first start.

### 2. Start the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

Copy the environment templates before changing local configuration:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

The frontend API URL defaults to `http://localhost:5000/api`. Override it with `VITE_API_BASE_URL` in `frontend/.env`.

## Demo accounts

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `Admin@123` |
| Manager | `manager` | `Manager@123` |
| SalesExecutive | `sales1` | `Sales@123` |

These credentials are development seed data only. Change authentication and secrets before production use.

## API quick test

Check the server:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

Login and keep the JWT:

```powershell
$login = Invoke-RestMethod `
  -Uri http://localhost:5000/api/auth/login `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"username":"admin","password":"Admin@123"}'

$headers = @{ Authorization = "Bearer $($login.token)" }
```

Call the protected customers API:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:5000/api/customers `
  -Headers $headers
```

Create a customer:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:5000/api/customers `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body '{"customerName":"Test Company","email":"test@example.com","phone":"9999888877"}'
```

The API rejects invalid email or phone values with HTTP `400`.

## API modules

- `GET/POST /api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/auth/me`
- `GET/POST/PUT/DELETE /api/customers`
- `GET/POST/PUT/DELETE /api/leads`, plus `POST /api/leads/:id/convert`
- `GET/POST/PUT/DELETE /api/opportunities`
- `GET/POST/PUT/DELETE /api/followups`
- `GET/POST/PUT/DELETE /api/activities`
- `GET/POST/PUT /api/users` and administrative password/unlock operations
- `/api/dashboard` for role-scoped KPIs and chart data
- `/api/reports/*` for pipeline, conversion, audit, and activity reports
- `GET /api/health` for service health

All protected endpoints require:

```text
Authorization: Bearer <JWT>
```

## Architecture

The Express entry point initializes the database, seed data, middleware, routes, and server. Route modules combine request handling with domain access through the shared SQLite layer. Authentication and role scope are centralized in middleware, validation uses `express-validator`, and mutations write audit records through the audit utility.

The React application uses a centralized Axios client. `AuthContext` owns session state and JWT persistence. The main workspace renders role-aware dashboard data and API-backed record views. The frontend does not call external services directly.

## Database and integrations

SQLite schema, constraints, indexes, and relationships are defined in `backend/src/config/database.js`. Seed data is created by `backend/src/config/seed.js`. Database files are ignored by Git.

External integrations are intentionally unconfigured. No API key is required for local startup. Add future providers behind backend adapters, keep credentials in environment variables, and never expose private values through `VITE_*` variables.

## Validation and tests

Frontend:

```powershell
cd frontend
npm run build
npm run lint
```

Backend:

```powershell
cd backend
npm test
npm run lint
```

The acceptance suite in `backend/tests/acceptance.test.js` verifies protected routes, invalid input rejection, opportunity and follow-up rules, role authorization, sales scope, CRUD behavior, and audit logging using an isolated SQLite database.

## Security notes

- Passwords are stored as bcrypt hashes, never plaintext.
- JWT bearer tokens protect API endpoints; no authentication cookies are used.
- Role authorization is enforced server-side and cannot be bypassed by changing the UI.
- Request bodies are validated on the server even when browser validation is bypassed.
- Helmet, CORS, rate limiting, body size limits, and centralized error handling are enabled.
- Replace the development JWT secret and seed credentials before deployment.

## Known limitations

- SQLite is intended for local development and small deployments; production should use a durable managed database or volume strategy.
- `better-sqlite3` may require native build tools if npm cannot download a compatible prebuilt binary.
- The current backend organizes domain handlers by route module; a larger production deployment could further split controllers, services, repositories, and view models.
