-- 「招待を発行できませんでした」と表示される場合の修正SQL
-- 既存の家族・メンバー・共有家事・招待データは削除しません。

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

  v_code := left(
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', ''),
    36
  );
  v_expires_at := now() + make_interval(
    hours => greatest(1, least(coalesce(p_valid_hours, 72), 168))
  );

  return query
  insert into public.household_invites as hi (
    household_id, code_hash, created_by, expires_at
  )
  values (
    p_household_id,
    sha256(convert_to(v_code, 'UTF8')),
    v_user_id,
    v_expires_at
  )
  returning hi.id, v_code, hi.expires_at;
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
  if exists (
    select 1
    from public.household_members hm
    where hm.user_id = v_user_id
  ) then
    raise exception 'すでに家族グループに参加しています';
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

revoke all on function public.create_household_invite(uuid, integer) from public, anon;
revoke all on function public.join_household_by_invite(text, text) from public, anon;
grant execute on function public.create_household_invite(uuid, integer) to authenticated;
grant execute on function public.join_household_by_invite(text, text) to authenticated;
