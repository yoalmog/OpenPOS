# OpenPOS — Supabase Auth baseline

This migration establishes a server-controlled role record for each Supabase Auth user.

## Apply the migration

1. Open the Supabase project used by OpenPOS.
2. Open **SQL Editor** and create a new query.
3. Paste the contents of `supabase/migrations/20261105000000_openpos_profiles.sql`.
4. Run it once. It is idempotent and can safely be re-run.
5. Verify the owner row:

```sql
select user_id, role, created_at
from public.profiles
where user_id = 'b245f371-9154-4dd3-aa4c-a5fb5266e5d3';
```

Expected role: `owner`.

## Server environment variables

The API integration will use these Vercel server-side environment variables:

- `SUPABASE_URL` — Project URL.
- `SUPABASE_ANON_KEY` — publishable/anon key used to validate the user access token through Supabase Auth.
- `SUPABASE_SERVICE_ROLE_KEY` — secret service-role key used only by the server to read trusted role records.

Never put `SUPABASE_SERVICE_ROLE_KEY` in browser code, Android resources, GitHub, or a public build variable. Do not paste it into chat.

## Security model

- New accounts are assigned `employee` by the database trigger.
- The owner role is assigned explicitly by this migration.
- Client-side user metadata is not an authorization source.
- Row-level security allows an authenticated user to read only their own profile.
- Role changes must be performed through a trusted administrative server operation or the Supabase SQL editor.
