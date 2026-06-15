import { redirect } from 'next/navigation';

// Redirect legacy /buy/account → /buy/profile
export default function AccountRedirectPage() {
  redirect('/buy/profile');
}
