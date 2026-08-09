-- 'verified' otp_sessions records (the multi-account selection handoff) have
-- no OTP code — the code was already consumed to reach 'verified'. otp was
-- NOT NULL with no default, so every attempt to write a verified record
-- silently failed the insert (buyer-otp-store swallows write errors),
-- leaving select-context with nothing to look up ("session expired").
ALTER TABLE app.otp_sessions ALTER COLUMN otp DROP NOT NULL;
