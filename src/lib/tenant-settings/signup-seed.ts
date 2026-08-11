export const DEFAULT_SIGNUP_DELIVERY_ROUTING_THRESHOLD_KM = 50;

export interface SignupTenantSettingsSeedInput {
  businessName: string;
  businessPhone: string;
  businessEmail: string;
  whatsappPhone?: string | null;
}

export function buildSignupTenantSettingsSeed({
  businessName,
  businessPhone,
  businessEmail,
  whatsappPhone,
}: SignupTenantSettingsSeedInput) {
  const phone = businessPhone.trim();
  const email = businessEmail.trim();
  const whatsapp = (whatsappPhone ?? phone).trim();

  return {
    business: {
      company_name: businessName.trim(),
      gstin: '',
      logo_url: null,
      address: {
        line1: '',
        line2: '',
        city: '',
        state: '',
        pincode: '',
      },
      phone,
      email,
    },
    product_defaults: {
      uom: 'PCS',
    },
    orders: {
      enquiry_number_format: 'EST-{YYYY}-{SEQ}',
      sales_order_number_format: 'SO-{YYYY}-{SEQ}',
      invoice_number_format: 'INV-{YYYY}-{SEQ}',
      inventory_lock_stage: 'sales_order',
      invoice_pdf_enabled: false,
      features: {
        enquiries: false,
        sales_orders: false,
        invoices: false,
        create_enquiries: true,
        create_sales_orders: true,
        create_invoices: true,
      },
    },
    buyer_app: {
      enabled: false,
      whatsapp_number: whatsapp,
      share_link_expiry_enabled: false,
      share_link_expiry_days: 90,
      credit_limit_visible: true,
      show_out_of_stock: true,
      stock_visibility_enabled: false,
      block_order_on_oos: false,
    },
    catalog: {
      price_lists_enabled: false,
      cohort_pricing_enabled: false,
      price_visibility: 'discounted_only',
      catalog_publishing_enabled: false,
      default_catalog_expiry_days: 0,
    },
    notifications: {
      whatsapp: {
        enquiry_received: true,
        order_placed: true,
        order_confirmed_to_buyer: true,
        dispatch_to_buyer: true,
        catalog_shared_to_buyer: true,
        response_eta_hours: 24,
      },
    },
    business_policy: {
      credit_enabled: true,
      gst_inclusive: false,
      gst_rate: 18,
    },
    delivery_routing_threshold_km: DEFAULT_SIGNUP_DELIVERY_ROUTING_THRESHOLD_KM,
  };
}
