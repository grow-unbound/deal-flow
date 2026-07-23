export interface BuyerAppEnablePreviewResponse {
  preview_message: string;
  preview_buyer_name: string;
  selected_count: number;
  recipient_count: number;
  credits_per_buyer: number;
  total_credits: number;
  credits_balance: number;
}

export interface BuyerAppAccessPatchResponse {
  updated_count: number;
  whatsapp_sent_count: number;
  whatsapp_eligible_count: number;
}
