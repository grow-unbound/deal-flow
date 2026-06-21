import { redirect } from 'next/navigation';

// Context selection is no longer used — phone OTP login always auto-selects the first
// seller account (or first buyer if no seller exists). See verify/route.ts.
export default function SelectContextPage() {
  redirect('/login');
}
