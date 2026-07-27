-- app.tenant_users.phone existed but was never backfilled the way email was in the
-- prior migration -- it was NULL for 4 of 5 rows, silently breaking
-- resolveSellerAuthPhone() (buyer preview account picker) for every seller whose
-- phone lived only in auth.users.raw_user_meta_data.phone. Backfill it the same way.
UPDATE app.tenant_users tu
SET phone = COALESCE(au.raw_user_meta_data->>'phone', au.phone)
FROM auth.users au
WHERE tu.user_id = au.id
  AND tu.phone IS NULL
  AND COALESCE(au.raw_user_meta_data->>'phone', au.phone) IS NOT NULL;
