import { redirect } from 'next/navigation';

export default async function CampaignSharePage({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  const { share_token } = await params;
  redirect(`/buy/home?share_token=${encodeURIComponent(share_token)}`);
}
