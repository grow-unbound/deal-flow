-- Public catalog + catalog login are core MVP now, not an opt-in module a
-- seller has to remember to switch on during onboarding. Flip already-
-- provisioned tenants that explicitly stored buyer_app.enabled = false back
-- to true. Tenants with no explicit value already pick up the new true
-- default from DEFAULT_TENANT_SETTINGS_STORED (app code), so this only needs
-- to touch rows that explicitly opted out.
UPDATE app.tenant_settings
SET settings = jsonb_set(settings, '{buyer_app,enabled}', 'true'::jsonb),
    updated_at = now()
WHERE settings -> 'buyer_app' ->> 'enabled' = 'false';

-- app.tenants.settings is the same shape and is read as a fallback when no
-- app.tenant_settings row exists yet (buyerAppMetadataFromSettings) — flip it
-- there too for consistency.
UPDATE app.tenants
SET settings = jsonb_set(settings, '{buyer_app,enabled}', 'true'::jsonb),
    updated_at = now()
WHERE settings -> 'buyer_app' ->> 'enabled' = 'false';
