-- Run once in Supabase SQL Editor as the project database owner.
-- Private schema: do NOT add bmw_private to the Data API exposed schemas.
begin;
create schema if not exists bmw_private;
revoke all on schema bmw_private from public;
create table if not exists bmw_private.bookings (
    id uuid primary key,
    name text not null,
    phone text not null,
    vehicle text not null,
    service text not null,
    preferred_date date not null,
    message text not null default '',
    created_at timestamptz not null default now(),
    ip_hash text not null,
    import_key text unique
);
create index if not exists bookings_created_idx on bmw_private.bookings (created_at desc);
create index if not exists bookings_ip_created_idx on bmw_private.bookings (ip_hash, created_at);
alter table bmw_private.bookings enable row level security;
revoke all on bmw_private.bookings from public;
-- Supabase API roles must have no access; database owner used by backend retains access.
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on schema bmw_private from %I', role_name);
      execute format('revoke all on all tables in schema bmw_private from %I', role_name);
    end if;
  end loop;
end $$;
commit;
