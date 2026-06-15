import { redirect } from 'next/navigation';

// Redirect legacy /shop/account → /shop/profile
export default function AccountRedirectPage() {
  redirect('/shop/profile');
}
