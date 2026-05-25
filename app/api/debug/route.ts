import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';

// Diagnostic endpoint — remove before production
export async function GET(request: NextRequest) {
  const steps: Record<string, unknown> = {};

  // Step 1: Auth claims
  try {
    const claims = await getVerifiedClaims(request);
    steps.claims = {
      tenant_id: claims.tenant_id,
      role: claims.role,
      buyer_id: claims.buyer_id,
    };
  } catch (err) {
    steps.claims = { error: String(err) };
  }

  // Step 2: supabaseAdmin null check
  steps.supabaseAdmin = supabaseAdmin ? 'initialized' : 'null (SUPABASE_SERVICE_KEY missing)';

  // Step 3: DB connectivity — simple query on app schema
  if (supabaseAdmin) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabaseAdmin as any;
      const { data, error } = await db
        .schema('app')
        .from('tenants')
        .select('id, slug')
        .limit(3);
      steps.db_tenants = error
        ? { error: { code: error.code, message: error.message, details: error.details } }
        : { rows: data ?? [] };
    } catch (err) {
      steps.db_tenants = { threw: String(err) };
    }

    // Step 4: catalog schema access
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabaseAdmin as any;
      const { data, error } = await db
        .schema('catalog')
        .from('brands')
        .select('id, name')
        .limit(3);
      steps.db_catalog_brands = error
        ? { error: { code: error.code, message: error.message } }
        : { rows: data ?? [] };
    } catch (err) {
      steps.db_catalog_brands = { threw: String(err) };
    }
  }

  // Step 5: env var presence (values hidden)
  steps.env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
  };

  return NextResponse.json(steps, { status: 200 });
}
