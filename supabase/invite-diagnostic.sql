-- 招待発行関数の動作確認
-- テスト結果は最後にROLLBACKするため、招待データは保存されません。

begin;

select set_config(
  'request.jwt.claim.sub',
  (
    select h.owner_user_id::text
    from public.households h
    order by h.created_at
    limit 1
  ),
  true
);

set local role authenticated;

select *
from public.create_household_invite(
  (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = auth.uid()
      and hm.role = 'owner'
    limit 1
  ),
  72
);

rollback;
