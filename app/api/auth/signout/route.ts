import { NextResponse } from 'next/server';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';

export async function POST() {
  try {
    const supabase = await getRequestSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to sign out', details: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Sign out error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
