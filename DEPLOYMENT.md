# BMWcodes v10 deployment

Architecture:

- Next.js frontend -> Vercel
- ASP.NET Core booking/admin API -> Railway
- PostgreSQL -> Supabase

## 1. Supabase PostgreSQL

1. Create a Supabase project.
2. Open the SQL editor and run `backend/supabase-schema.sql`.
3. Open database connection settings and copy a PostgreSQL connection string.
4. Keep the database password private. Do not put it in the frontend or commit it to Git.
5. Railway will receive this value as `DATABASE_URL`.

The backend also runs `CREATE TABLE IF NOT EXISTS`, so the SQL file is a transparent reference and a manual setup option.

## 2. Railway backend

Create a Railway service from the repository and set its root directory to `backend`.
Railway can build the included `backend/Dockerfile`.

Set these Railway environment variables:

```text
DATABASE_URL=<Supabase PostgreSQL connection string>
ALLOWED_ORIGINS=https://YOUR-VERCEL-DOMAIN.vercel.app
TRUSTED_PROXY_CIDRS=<CIDR(s) of the Railway reverse proxy that reaches this service>
ADMIN_USERNAME=<owner login>
ADMIN_PASSWORD=<strong password>
ADMIN_TOKEN_SECRET=<long random secret>
RATE_LIMIT_SECRET=<different long random secret>
```

Important: do not use `0.0.0.0/0` for `TRUSTED_PROXY_CIDRS`. The API deliberately ignores forwarded IP headers unless the immediate connection comes from a trusted proxy network.

Health check:

```text
/health
```

Expected production response:

```json
{"status":"ok","storage":"postgres"}
```

After Railway deploys, copy its public HTTPS domain.

## 3. Vercel frontend

Import the repository into Vercel and leave the project root as the repository root.

Set:

```text
NEXT_PUBLIC_BOOKING_API_URL=https://YOUR-RAILWAY-DOMAIN/api/bookings
```

Deploy once, copy the Vercel domain, then return to Railway and set `ALLOWED_ORIGINS` to the exact Vercel/custom domain. If you use both a Vercel domain and a custom domain, separate them with commas.

Redeploy Railway after changing environment variables.

## 4. Production checks

Check these URLs/actions:

1. Frontend home page loads on Vercel.
2. `https://YOUR-RAILWAY-DOMAIN/health` returns `storage: postgres`.
3. Submit one booking from the Vercel site.
4. Open `/admin`, sign in, and verify that the request is visible.
5. Confirm the row also exists in Supabase `public.bookings`.
6. Verify requests from origins not listed in `ALLOWED_ORIGINS` fail CORS in a browser.
7. Verify the sixth request from the same client IP inside six hours is rejected with HTTP 429.

## Local development

Frontend:

```powershell
npm install
npm run dev
```

Backend without PostgreSQL (uses local `App_Data/bookings.jsonl` fallback):

```powershell
cd backend
dotnet restore
dotnet user-secrets init
dotnet user-secrets set "ADMIN_USERNAME" "admin"
dotnet user-secrets set "ADMIN_PASSWORD" "your-password"
dotnet user-secrets set "ADMIN_TOKEN_SECRET" "long-random-secret"
dotnet user-secrets set "RATE_LIMIT_SECRET" "another-long-random-secret"
dotnet run
```

Backend with Supabase locally:

```powershell
dotnet user-secrets set "DATABASE_URL" "YOUR_SUPABASE_CONNECTION_STRING"
dotnet user-secrets set "ALLOWED_ORIGINS" "http://localhost:3000"
dotnet run
```

Local frontend uses `http://localhost:5080/api/bookings` by default.
