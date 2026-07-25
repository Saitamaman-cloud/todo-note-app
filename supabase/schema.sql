-- 今日メモTodo / 共有家事
-- Supabase Dashboard > SQL Editor で、このファイル全体を1回実行してください。

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table if not exists public.shared_todos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  due_date date not null,
  due_time time,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  is_priority boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash bytea not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists household_members_user_idx
  on public.household_members(user_id, household_id);
create index if not exists shared_todos_household_due_idx
  on public.shared_todos(household_id, due_date, due_time);
create index if not exists shared_todos_assignee_idx
  on public.shared_todos(household_id, assignee_user_id);
create index if not exists household_invites_household_idx
  on public.household_invites(household_id, expires_at);

create or replace function private.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_household_member_user(
  p_household_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = p_user_id
  );
$$;

create or replace function private.is_household_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.households h
    where h.id = p_household_id
      and h.owner_user_id = (select auth.uid())
  );
$$;

create or replace function private.can_access_realtime_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and ('household:' || hm.household_id::text) = p_topic
  );
$$;

revoke all on function private.is_household_member(uuid) from public;
revoke all on function private.is_household_member_user(uuid, uuid) from public;
revoke all on function private.is_household_owner(uuid) from public;
revoke all on function private.can_access_realtime_topic(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_household_member_user(uuid, uuid) to authenticated;
grant execute on function private.is_household_owner(uuid) to authenticated;
grant execute on function private.can_access_realtime_topic(text) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.shared_todos enable row level security;
alter table public.household_invites enable row level security;

drop policy if exists households_select_member on public.households;
create policy households_select_member
on public.households for select to authenticated
using ((select private.is_household_member(id)));

drop policy if exists household_members_select_member on public.household_members;
create policy household_members_select_member
on public.household_members for select to authenticated
using ((select private.is_household_member(household_id)));

drop policy if exists shared_todos_select_member on public.shared_todos;
create policy shared_todos_select_member
on public.shared_todos for select to authenticated
using ((select private.is_household_member(household_id)));

drop policy if exists shared_todos_insert_member on public.shared_todos;
create policy shared_todos_insert_member
on public.shared_todos for insert to authenticated
with check (
  (select private.is_household_member(household_id))
  and created_by = (select auth.uid())
  and (
    assignee_user_id is null
    or (select private.is_household_member_user(household_id, assignee_user_id))
  )
);

drop policy if exists shared_todos_update_member on public.shared_todos;
create policy shared_todos_update_member
on public.shared_todos for update to authenticated
using ((select private.is_household_member(household_id)))
with check (
  (select private.is_household_member(household_id))
  and (
    assignee_user_id is null
    or (select private.is_household_member_user(household_id, assignee_user_id))
  )
);

drop policy if exists shared_todos_delete_member on public.shared_todos;
create policy shared_todos_delete_member
on public.shared_todos for delete to authenticated
using ((select private.is_household_member(household_id)));

drop policy if exists household_invites_select_owner on public.household_invites;
create policy household_invites_select_owner
on public.household_invites for select to authenticated
using ((select private.is_household_owner(household_id)));

revoke all on public.households from anon, authenticated;
revoke all on public.household_members from anon, authenticated;
revoke all on public.shared_todos from anon, authenticated;
revoke all on public.household_invites from anon, authenticated;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.shared_todos to authenticated;
grant select (
  id, household_id, created_by, created_at, expires_at, used_at, used_by, revoked_at
) on public.household_invites to authenticated;

create or replace function public.set_shared_todo_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_shared_todo_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.household_id is distinct from old.household_id
     or new.created_by is distinct from old.created_by then
    raise exception 'ID、共有先、作成者は変更できません';
  end if;
  return new;
end;
$$;

drop trigger if exists shared_todos_set_updated_at on public.shared_todos;
create trigger shared_todos_set_updated_at
before update on public.shared_todos
for each row execute function public.set_shared_todo_updated_at();

drop trigger if exists shared_todos_protect_identity on public.shared_todos;
create trigger shared_todos_protect_identity
before update on public.shared_todos
for each row execute function public.protect_shared_todo_identity();

create or replace function public.create_household(
  p_name text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception '家族グループ名を入力してください';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 30 then
    raise exception '表示名を入力してください';
  end if;
  if exists (select 1 from public.household_members hm where hm.user_id = v_user_id) then
    raise exception '既に家族グループに参加しています';
  end if;

  insert into public.households(name, owner_user_id)
  values (btrim(p_name), v_user_id)
  returning id into v_household_id;

  insert into public.household_members(household_id, user_id, display_name, role)
  values (v_household_id, v_user_id, btrim(p_display_name), 'owner');

  return v_household_id;
end;
$$;

create or replace function public.create_household_invite(
  p_household_id uuid,
  p_valid_hours integer default 72
)
returns table(invite_id uuid, invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_code text;
  v_expires_at timestamptz;
begin
  if v_user_id is null or not private.is_household_owner(p_household_id) then
    raise exception '招待を発行できるのはグループ作成者だけです';
  end if;

  update public.household_invites as hi
  set revoked_at = now()
  where hi.household_id = p_household_id
    and hi.used_at is null
    and hi.revoked_at is null
    and hi.expires_at > now();

  -- pgcrypto の配置スキーマに依存せず、推測困難な36桁の16進コードを作る。
  v_code := left(
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', ''),
    36
  );
  v_expires_at := now() + make_interval(hours => greatest(1, least(coalesce(p_valid_hours, 72), 168)));

  return query
  insert into public.household_invites(
    household_id, code_hash, created_by, expires_at
  )
  values (
    p_household_id,
    sha256(convert_to(v_code, 'UTF8')),
    v_user_id,
    v_expires_at
  )
  returning id, v_code, public.household_invites.expires_at;
end;
$$;

create or replace function public.join_household_by_invite(
  p_invite_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_code text := lower(btrim(coalesce(p_invite_code, '')));
  v_invite public.household_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;
  if v_code !~ '^[0-9a-f]{36}$' then
    raise exception '招待コードの形式が正しくありません';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 30 then
    raise exception '表示名を入力してください';
  end if;
  if exists (select 1 from public.household_members hm where hm.user_id = v_user_id) then
    raise exception '既に家族グループに参加しています';
  end if;

  select *
  into v_invite
  from public.household_invites hi
  where hi.code_hash = sha256(convert_to(v_code, 'UTF8'))
  for update;

  if v_invite.id is null
     or v_invite.revoked_at is not null
     or v_invite.used_at is not null
     or v_invite.expires_at <= now() then
    raise exception '招待コードが無効、使用済み、または期限切れです';
  end if;

  insert into public.household_members(household_id, user_id, display_name, role)
  values (v_invite.household_id, v_user_id, btrim(p_display_name), 'member');

  update public.household_invites
  set used_at = now(), used_by = v_user_id
  where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

create or replace function public.revoke_household_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select hi.household_id into v_household_id
  from public.household_invites hi
  where hi.id = p_invite_id;

  if v_household_id is null or not private.is_household_owner(v_household_id) then
    raise exception '招待を無効にできるのはグループ作成者だけです';
  end if;

  update public.household_invites
  set revoked_at = coalesce(revoked_at, now())
  where id = p_invite_id and used_at is null;
  return found;
end;
$$;

create or replace function public.leave_household(p_household_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.is_household_member(p_household_id) then
    raise exception 'この家族グループには参加していません';
  end if;
  if private.is_household_owner(p_household_id) then
    raise exception 'グループ作成者は脱退できません。必要な場合はグループを削除してください';
  end if;

  delete from public.household_members
  where household_id = p_household_id and user_id = v_user_id;
  return found;
end;
$$;

create or replace function public.delete_household(p_household_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_household_owner(p_household_id) then
    raise exception 'グループを削除できるのは作成者だけです';
  end if;

  delete from public.households where id = p_household_id;
  return found;
end;
$$;

revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.create_household_invite(uuid, integer) from public, anon;
revoke all on function public.join_household_by_invite(text, text) from public, anon;
revoke all on function public.revoke_household_invite(uuid) from public, anon;
revoke all on function public.leave_household(uuid) from public, anon;
revoke all on function public.delete_household(uuid) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.create_household_invite(uuid, integer) to authenticated;
grant execute on function public.join_household_by_invite(text, text) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.delete_household(uuid) to authenticated;

create or replace function public.notify_household_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := coalesce(new.household_id, old.household_id);
  v_event text := case
    when tg_table_name = 'shared_todos' then 'shared_todos_changed'
    else 'household_members_changed'
  end;
begin
  perform realtime.send(
    jsonb_build_object('changed', true),
    v_event,
    'household:' || v_household_id::text,
    true
  );
  return null;
end;
$$;

revoke all on function public.notify_household_change() from public, anon, authenticated;

drop trigger if exists shared_todos_notify_realtime on public.shared_todos;
create trigger shared_todos_notify_realtime
after insert or update or delete on public.shared_todos
for each row execute function public.notify_household_change();

drop trigger if exists household_members_notify_realtime on public.household_members;
create trigger household_members_notify_realtime
after insert or update or delete on public.household_members
for each row execute function public.notify_household_change();

drop policy if exists household_members_receive_broadcasts on realtime.messages;
create policy household_members_receive_broadcasts
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast')
  and (select private.can_access_realtime_topic((select realtime.topic())))
);

-- 念のため、匿名ロールには共有テーブル・共有RPCの権限を一切与えません。
revoke all on public.households from anon;
revoke all on public.household_members from anon;
revoke all on public.shared_todos from anon;
revoke all on public.household_invites from anon;
