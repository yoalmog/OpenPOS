-- OpenPOS Supabase identity and role baseline
-- Apply in the Supabase SQL Editor. Roles are assigned server-side only.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'employee'
    check (role in ('owner', 'admin', 'employee')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
grant select on table public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.handle_new_openpos_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, role, display_name)
  values (
    new.id,
    'employee',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_openpos on auth.users;
create trigger on_auth_user_created_openpos
  after insert on auth.users
  for each row execute procedure public.handle_new_openpos_user();

-- Promote the already-created store owner. This does not expose role editing
-- to the client; only this trusted SQL operation or the server can change roles.
insert into public.profiles (user_id, role)
values ('b245f371-9154-4dd3-aa4c-a5fb5266e5d3'::uuid, 'owner')
on conflict (user_id)
do update set role = 'owner', updated_at = now();
