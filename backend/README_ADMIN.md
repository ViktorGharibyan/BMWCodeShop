# BMWcodes booking admin

The owner panel is available at `/admin` on the Next.js frontend. It reads booking requests through the authenticated ASP.NET Core API.

## Storage

- If `DATABASE_URL` is configured, bookings are stored in PostgreSQL (prepared for Supabase).
- If `DATABASE_URL` is not configured, local development falls back to `App_Data/bookings.jsonl`.

## Local setup on Windows / PowerShell

```powershell
cd backend
dotnet restore
dotnet user-secrets init
dotnet user-secrets set "ADMIN_USERNAME" "admin"
dotnet user-secrets set "ADMIN_PASSWORD" "replace-with-your-own-strong-password"
dotnet user-secrets set "ADMIN_TOKEN_SECRET" "replace-with-a-long-random-secret"
dotnet user-secrets set "RATE_LIMIT_SECRET" "replace-with-another-long-random-secret"
dotnet run
```

The API runs at `http://localhost:5080` using the included launch profile.

Open:

```text
http://localhost:3000/admin
```

## PostgreSQL / Supabase

Set `DATABASE_URL` to the Supabase PostgreSQL connection string. The API creates the `bookings` table and indexes automatically if they do not exist. The same schema is also included in `supabase-schema.sql`.

## Production security variables

```text
ALLOWED_ORIGINS=https://your-site.example
TRUSTED_PROXY_CIDRS=<actual CIDR(s) of the reverse proxy reaching the API>
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
ADMIN_TOKEN_SECRET=...
RATE_LIMIT_SECRET=...
DATABASE_URL=...
```

`X-Forwarded-For` is ignored unless the immediate proxy is in `TRUSTED_PROXY_CIDRS`. Do not use `0.0.0.0/0`.

## Protection built into the API

- Required booking fields are validated server-side.
- Preferred date is limited to today through one calendar month ahead in `America/New_York`.
- Service values are checked against the real service list.
- Phone numbers are normalized as U.S. numbers.
- Names and vehicle descriptions use character allow-lists.
- Optional messages are length-limited and rendered as text in the admin UI.
- A hidden honeypot rejects basic automated submissions.
- One normalized client IP is limited to 5 booking requests in a rolling 6-hour window.
- Admin login is protected by a 5-attempt / 15-minute per-IP limiter.
- Admin access uses a signed 12-hour bearer token in browser session storage.
- Production CORS is restricted to `ALLOWED_ORIGINS`.
