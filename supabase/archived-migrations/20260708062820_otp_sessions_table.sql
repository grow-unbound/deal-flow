-- Create OTP sessions table for phone OTP login flow
-- Stores temporary OTP records for verification across serverless instances

create table if not exists app.otp_sessions (
  ref_id uuid primary key default gen_random_uuid(),
  otp text not null,
  phone text not null,
  kind text not null check (kind in ('pending', 'verified')),
  expires_at bigint not null,
  attempts int not null default 0,
  candidates jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone
);

-- Index for fast lookups and cleanup
create index idx_otp_sessions_ref_id on app.otp_sessions(ref_id);
create index idx_otp_sessions_expires_at on app.otp_sessions(expires_at);
create index idx_otp_sessions_deleted_at on app.otp_sessions(deleted_at);

-- RLS: OTP sessions are public read/write (no auth needed during login flow)
alter table app.otp_sessions enable row level security;

create policy "otp_sessions_public" on app.otp_sessions
  for all
  using (true)
  with check (true);

comment on table app.otp_sessions is 'Temporary OTP session records for phone-based login flow. Designed to work across serverless instances.';
