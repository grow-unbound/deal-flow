-- One-time cleanup: ensureBuyerOwnerPrincipal() used to create a synthetic
-- app.buyer_users row for every buyer owner's first login (role='buyer_admin',
-- same phone as the owner, no first/last name, a deterministic
-- 'buyer-<phone>-<buyer_id>@buyers.yukti.local' auth email). That combination
-- of signals is unique to this bug — no other code path produces it — so it's
-- safe to select on precisely and move on.
--
-- Step 1: carry the already-working auth.users identity onto buyers.user_id
-- so nobody's existing session/login breaks.
UPDATE app.buyers b
SET user_id = bu.user_id, updated_at = now()
FROM app.buyer_users bu
JOIN auth.users u ON u.id = bu.user_id
WHERE bu.buyer_id = b.id
  AND bu.role = 'buyer_admin'
  AND bu.phone = b.phone
  AND bu.first_name IS NULL AND bu.last_name IS NULL
  AND u.email LIKE 'buyer-%@buyers.yukti.local'
  AND b.user_id IS NULL;

-- Step 2: remove the now-redundant shadow rows.
DELETE FROM app.buyer_users bu
USING app.buyers b, auth.users u
WHERE bu.buyer_id = b.id
  AND u.id = bu.user_id
  AND bu.role = 'buyer_admin'
  AND bu.phone = b.phone
  AND bu.first_name IS NULL AND bu.last_name IS NULL
  AND u.email LIKE 'buyer-%@buyers.yukti.local'
  AND b.user_id = bu.user_id;
