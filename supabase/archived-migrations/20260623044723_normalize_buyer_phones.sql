-- Normalize app.buyers.phone to pure 10-digit format (no +91 or 91 prefix).
-- Root cause: seed data and direct DB inserts bypassed Zod validation which enforces
-- the 10-digit rule; all API write paths are already clean.
--
-- After this migration: app.buyers.phone is always NULL or exactly 10 digits,
-- and findBuyerLoginCandidates can use simple .eq() instead of LIKE hacks.

-- Step 1: NULL out invalid phone values (< 10 digits after stripping non-numeric chars).
-- These are unusable for OTP lookup anyway.
UPDATE app.buyers
SET phone = NULL
WHERE phone IS NOT NULL
  AND phone !~ '^[0-9]{10}$'
  AND LENGTH(regexp_replace(phone, '[^0-9]', '', 'g')) < 10;

-- Step 2: Strip +91, 91, 0 prefixes from valid but prefixed phone numbers.
UPDATE app.buyers
SET phone = RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
WHERE phone IS NOT NULL
  AND phone !~ '^[0-9]{10}$';

-- Step 3: Enforce format going forward.
ALTER TABLE app.buyers
  ADD CONSTRAINT IF NOT EXISTS buyers_phone_format
  CHECK (phone IS NULL OR phone ~ '^[0-9]{10}$');
