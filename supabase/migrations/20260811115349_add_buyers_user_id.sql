-- A buyer owner logs in as app.buyers directly and needs an auth.users link.
-- Previously there was nowhere to store that, so ensureBuyerOwnerPrincipal()
-- lazily created a synthetic app.buyer_users "shadow" row per owner just to
-- hold user_id — buyer_users is meant for real staff (assistants/managers)
-- under a buyer, not the owner's own login identity. This column removes the
-- need for that workaround.
ALTER TABLE app.buyers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
