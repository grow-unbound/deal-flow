export interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'seller_admin' | 'seller_assistant';
  status: 'active' | 'pending';
  invited_at: string | null;
  joined_at: string | null;
}
