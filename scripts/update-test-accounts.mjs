/**
 * Update email + password for test accounts in Supabase auth.users
 * Usage:  node scripts/update-test-accounts.mjs
 *
 * Edit ACCOUNTS below before running.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load .env.local from project root ────────────────────────────────────────────────────────────
const envPath = process.env.NODE_ENV === 'development' ? resolve(process.cwd(), '.env.local') : resolve(process.cwd(), '../.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Edit these ─────────────────────────────────────────────────────────────────
const ACCOUNTS = [
  {
    phone: '+919490744841',
    email: 'santosh.phani@gmail.com',
    password: 'Welcome@123',
  },
  {
    phone: '+918985987350',
    email: 'ksssp.iiith@gmail.com',
    password: 'Welcome@123',
  },
];
// ──────────────────────────────────────────────────────────────────────────────

async function listUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 50 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users;
}

async function updateAccount({ phone, email, password }) {
  // Find existing user by email
  const users = await listUsers();
  const existing = users.find((u) => u.phone === phone);

  if (existing) {
    // User already exists — just update password
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,   // skip email confirmation for test accounts
    });
    if (error) throw new Error(`Update failed for ${email}: ${error.message}`);
    console.log(`✓ [${phone}] Updated password for ${email}  (id: ${existing.id})`);
  } else {
    // Create fresh
    const { data, error } = await supabase.auth.admin.createUser({
      phone,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`Create failed for ${email}: ${error.message}`);
    console.log(`✓ [${phone}] Created ${email}  (id: ${data.user.id})`);
  }
}

async function main() {
  console.log('\n── DealFlow · test account setup ─────────────────────────\n');

  // Show current users first
  const users = await listUsers();
  console.log(`Current auth.users (${users.length} total):`);
  users.forEach((u) => {
    const confirmed = u.email_confirmed_at ? '✓' : '✗';
    console.log(`  ${confirmed}  ${u.email ?? '(no email)'}  — ${u.id}`);
  });
  console.log('');

  for (const account of ACCOUNTS) {
    await updateAccount(account);
  }

  console.log('\nDone. You can now log in at http://localhost:3000/login\n');
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
