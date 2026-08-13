import { redirect } from 'next/navigation';

export default function BuyerHomeRedirectPage() {
  redirect('/buy/catalog');
}
