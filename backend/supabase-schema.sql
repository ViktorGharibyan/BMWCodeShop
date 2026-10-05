BEGIN;

CREATE TABLE IF NOT EXISTS public.bookings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  service TEXT NOT NULL,
  preferred_date DATE NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_bookings_created_at
  ON public.bookings (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_bookings_ip_hash_created_at
  ON public.bookings (ip_hash, created_at DESC);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.bookings
  FROM PUBLIC, anon, authenticated;

COMMIT;