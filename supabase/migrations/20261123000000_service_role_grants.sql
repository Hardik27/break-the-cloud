-- The finish-run Edge Function uses the service role (secret key) to read a started run and record its result.
-- Newer Supabase projects do not give service_role table privileges by default, so grant exactly what it needs.
grant select, update on public.runs to service_role;
