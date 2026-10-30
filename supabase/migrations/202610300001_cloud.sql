-- Sprig cloud maps. Map contents are private by default; share access is per map.
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  title text not null default 'Untitled map',
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  constraint maps_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint maps_data_size check (pg_column_size(data) <= 2097152),
  constraint maps_title_size check (char_length(title) between 1 and 200)
);

create table public.map_shares (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_email text not null,
  role text not null check (role in ('viewer', 'editor')),
  recipient_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint map_shares_email_normalized check (
    invite_email = lower(btrim(invite_email)) and invite_email <> ''
  ),
  constraint map_shares_unique_email unique (map_id, invite_email)
);

create index maps_owner_updated_idx on public.maps(owner_id, updated_at desc);
create index map_shares_recipient_idx on public.map_shares(recipient_id, map_id);
create index map_shares_owner_idx on public.map_shares(owner_id, map_id);

alter table public.maps enable row level security;
alter table public.map_shares enable row level security;

-- SECURITY DEFINER avoids recursive RLS checks between maps and map_shares.
create or replace function private.map_role(p_map_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when m.owner_id = (select auth.uid()) then 'owner'
    else (
      select s.role
      from public.map_shares as s
      where s.map_id = m.id
        and s.recipient_id = (select auth.uid())
      order by (s.role = 'editor') desc
      limit 1
    )
  end
  from public.maps as m
  where m.id = p_map_id
$$;

revoke all on function private.map_role(uuid) from public, anon;
grant execute on function private.map_role(uuid) to authenticated;

create policy maps_read_owner_or_share
on public.maps for select to authenticated
using (owner_id = (select auth.uid()) or private.map_role(id) is not null);

create policy map_shares_read_owner_or_recipient
on public.map_shares for select to authenticated
using (owner_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- Direct table writes are intentionally unavailable to browser clients. RPCs below
-- check role and version in one transaction before writing.
revoke all on table public.maps, public.map_shares from public, anon, authenticated;
grant select on table public.maps, public.map_shares to authenticated;

create or replace function private.map_title(p_data jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(left(btrim(p_data #>> '{nodeData,topic}'), 200), ''), 'Untitled map')
$$;

create or replace function private.validate_map_data(p_data jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_node jsonb;
  v_entry jsonb;
  v_queue jsonb := jsonb_build_array(jsonb_build_object('node', p_data -> 'nodeData', 'depth', 0));
  v_seen text[] := '{}';
  v_id text;
  v_depth integer;
  v_count integer := 0;
begin
  if p_data is null or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid mind map data';
  end if;
  if pg_column_size(p_data) > 2097152 then
    raise exception using errcode = '22023', message = 'Mind map data exceeds 2 MiB';
  end if;
  while jsonb_array_length(v_queue) > 0 loop
    v_entry := v_queue -> 0;
    v_queue := v_queue - 0;
    v_node := v_entry -> 'node';
    v_depth := (v_entry ->> 'depth')::integer;
    v_count := v_count + 1;
    if v_count > 3000 or v_depth > 60
      or jsonb_typeof(v_node) is distinct from 'object'
      or jsonb_typeof(v_node -> 'topic') is distinct from 'string'
      or length(btrim(v_node ->> 'topic')) = 0
      or length(v_node ->> 'topic') > 10000
      or jsonb_typeof(v_node -> 'id') is distinct from 'string'
      or (v_node ->> 'id') !~ '^[a-zA-Z0-9_-]{1,100}$' then
      raise exception using errcode = '22023', message = 'Invalid mind map node';
    end if;
    v_id := v_node ->> 'id';
    if v_id = any(v_seen) then
      raise exception using errcode = '22023', message = 'Duplicate mind map node ID';
    end if;
    v_seen := array_append(v_seen, v_id);
    if v_node ? 'children' then
      if jsonb_typeof(v_node -> 'children') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'Invalid mind map children';
      end if;
      v_queue := v_queue || coalesce((select jsonb_agg(jsonb_build_object('node', c, 'depth', v_depth + 1))
        from jsonb_array_elements(v_node -> 'children') as c), '[]'::jsonb);
      if v_count + jsonb_array_length(v_queue) > 3000 then
        raise exception using errcode = '22023', message = 'Too many mind map nodes';
      end if;
    end if;
  end loop;
end
$$;

revoke all on function private.map_title(jsonb), private.validate_map_data(jsonb)
from public, anon, authenticated;

create or replace function public.create_map(p_data jsonb, p_id uuid default null)
returns table (id uuid, data jsonb, title text, owner_id uuid, updated_at timestamptz, version bigint, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_map public.maps%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sign in required';
  end if;
  perform private.validate_map_data(p_data);
  insert into public.maps as m (id, owner_id, data, title)
  values (v_id, v_uid, p_data, private.map_title(p_data))
  on conflict on constraint maps_pkey do nothing;
  select * into v_map from public.maps where maps.id = v_id;
  if v_map.owner_id is distinct from v_uid then
    raise exception using errcode = '42501', message = 'Map ID is already in use';
  end if;
  return query select v_map.id, v_map.data, v_map.title, v_map.owner_id,
    v_map.updated_at, v_map.version, 'owner'::text;
end
$$;

create or replace function public.save_map(p_id uuid, p_expected_version bigint, p_data jsonb)
returns table (id uuid, data jsonb, title text, owner_id uuid, updated_at timestamptz, version bigint, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_map public.maps%rowtype;
  v_role text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sign in required';
  end if;
  select * into v_map from public.maps where maps.id = p_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Map is not editable';
  end if;
  v_role := private.map_role(p_id);
  if v_role is null or v_role not in ('owner', 'editor') then
    raise exception using errcode = '42501', message = 'Map is not editable';
  end if;
  perform private.validate_map_data(p_data);
  if v_map.version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'Map version conflict';
  end if;
  update public.maps as m set data = p_data, title = private.map_title(p_data),
    updated_at = clock_timestamp(), version = m.version + 1
  where m.id = p_id
  returning * into v_map;
  return query select v_map.id, v_map.data, v_map.title, v_map.owner_id,
    v_map.updated_at, v_map.version, v_role;
end
$$;

create or replace function public.list_maps()
returns table (id uuid, data jsonb, title text, owner_id uuid, updated_at timestamptz, version bigint, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sign in required';
  end if;
  return query
  select m.id, m.data, m.title, m.owner_id, m.updated_at, m.version,
    private.map_role(m.id)
  from public.maps as m
  where private.map_role(m.id) is not null
  order by m.updated_at desc;
end
$$;

create or replace function public.get_map(p_id uuid)
returns table (id uuid, data jsonb, title text, owner_id uuid, updated_at timestamptz, version bigint, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sign in required';
  end if;
  v_role := private.map_role(p_id);
  if v_role is null then
    return;
  end if;
  return query select m.id, m.data, m.title, m.owner_id, m.updated_at, m.version, v_role
    from public.maps as m where m.id = p_id;
end
$$;

create or replace function public.share_map(p_map_id uuid, p_email text, p_role text)
returns table (id uuid, map_id uuid, invite_email text, role text, recipient_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_map_role text;
  v_recipient uuid;
  v_share public.map_shares%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sign in required';
  end if;
  v_map_role := private.map_role(p_map_id);
  if v_map_role is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'Only the owner can manage shares';
  end if;
  if v_email is null or v_email = '' or length(v_email) > 320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Invalid email address';
  end if;
  if p_role is null or p_role not in ('viewer', 'editor') then
    raise exception using errcode = '22023', message = 'Role must be viewer or editor';
  end if;
  select u.id into v_recipient from auth.users as u
  where lower(u.email) = v_email and u.email_confirmed_at is not null
  order by u.created_at limit 1;
  insert into public.map_shares as s (map_id, owner_id, invite_email, role, recipient_id)
  values (p_map_id, v_uid, v_email, p_role, v_recipient)
  on conflict on constraint map_shares_unique_email do update
    set role = excluded.role,
        recipient_id = coalesce(s.recipient_id, excluded.recipient_id)
  returning * into v_share;
  return query select v_share.id, v_share.map_id, v_share.invite_email,
    v_share.role, v_share.recipient_id, v_share.created_at;
end
$$;

create or replace function public.revoke_map_share(p_map_id uuid, p_share_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_deleted integer;
begin
  if v_uid is null or private.map_role(p_map_id) is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'Only the owner can manage shares';
  end if;
  delete from public.map_shares as s where s.id = p_share_id and s.map_id = p_map_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end
$$;

create or replace function public.claim_map_shares()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_count integer;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sign in required';
  end if;
  select lower(u.email) into v_email from auth.users as u
  where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  update public.map_shares as s set recipient_id = v_uid
  where lower(s.invite_email) = v_email
    and s.recipient_id is null
    and s.owner_id <> v_uid;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

create or replace function public.list_map_shares(p_map_id uuid)
returns table (id uuid, map_id uuid, invite_email text, role text, recipient_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or private.map_role(p_map_id) is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'Only the owner can manage shares';
  end if;
  return query select s.id, s.map_id, s.invite_email, s.role, s.recipient_id, s.created_at
  from public.map_shares as s where s.map_id = p_map_id order by s.created_at, s.id;
end
$$;

-- Never expose the service-role key to the browser. All exposed RPCs require auth.
revoke all on function public.create_map(jsonb, uuid) from public, anon;
revoke all on function public.save_map(uuid, bigint, jsonb) from public, anon;
revoke all on function public.list_maps() from public, anon;
revoke all on function public.get_map(uuid) from public, anon;
revoke all on function public.share_map(uuid, text, text) from public, anon;
revoke all on function public.revoke_map_share(uuid, uuid) from public, anon;
revoke all on function public.claim_map_shares() from public, anon;
revoke all on function public.list_map_shares(uuid) from public, anon;
grant execute on function public.create_map(jsonb, uuid) to authenticated;
grant execute on function public.save_map(uuid, bigint, jsonb) to authenticated;
grant execute on function public.list_maps() to authenticated;
grant execute on function public.get_map(uuid) to authenticated;
grant execute on function public.share_map(uuid, text, text) to authenticated;
grant execute on function public.revoke_map_share(uuid, uuid) to authenticated;
grant execute on function public.claim_map_shares() to authenticated;
grant execute on function public.list_map_shares(uuid) to authenticated;

