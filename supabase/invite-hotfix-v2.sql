-- 招待発行時の「expires_at is ambiguous」エラー修正
-- 既存データは削除・変更しません。

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

revoke all on function public.create_household_invite(uuid, integer) from public, anon;
grant execute on function public.create_household_invite(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
