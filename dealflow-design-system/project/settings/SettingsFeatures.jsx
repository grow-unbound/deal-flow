// settings/SettingsFeatures.jsx

function SettingsFeatures({ tier = 'starter' }) {
  const { useState } = React;

  const [orders, setOrders] = useState({
    number_format: 'WY-{YYYY}-{SEQ}',
    lock_stage: 'sales_order',
    invoice_pdf: true,
    enquiries: true,
    sales_orders: true,
    invoices: true,
  });
  const [app, setApp] = useState({
    enabled: true,
    whatsapp_number: '+91 98765 43210',
    expiry_enabled: false,
    expiry_days: 90,
    credit_visible: false,
    show_oos: true,
  });
  const [cat, setCat] = useState({
    cohort_on: true,
    price_vis: 'discounted_only',
    catalog_on: false,
    catalog_expiry: 0,
  });

  const TIER_LIMITS  = { starter: { cohorts: 5, lists: 2, catalogs: 3 }, growth: { cohorts: 20, lists: 10, catalogs: 15 }, scale: {} };
  const USAGE        = { cohorts: 3, lists: 2, catalogs: 1 };
  const lim          = TIER_LIMITS[tier] || {};

  function previewFmt(fmt) {
    const d = new Date();
    return fmt
      .replace('{YYYY}', d.getFullYear())
      .replace('{MM}',   String(d.getMonth() + 1).padStart(2, '0'))
      .replace('{DD}',   String(d.getDate()).padStart(2, '0'))
      .replace('{SEQ}',  '0001');
  }

  const SubSection = ({ label }) => (
    <div className="feature-sub-section-label">{label}</div>
  );

  const SubItem = ({ label, desc, right }) => (
    <div className="feature-sub-item">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="feature-sub-label">{label}</div>
        {desc && <div className="feature-sub-desc">{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 740 }}>
      <div className="settings-page-header">
        <h1 className="settings-page-title">Feature Modules</h1>
        <p className="settings-page-sub">Turn features on or off and configure how they work for your business.</p>
      </div>

      {/* ══ ORDER WORKFLOWS ══ */}
      <div className="feature-card">
        <FeatHeader icon="fileText" title="Order Workflows" alwaysOn
          desc="Configure how orders flow through your system — from enquiry to invoice."
          enabled={true} />

        {/* Global config */}
        <div className="feature-sub-settings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="field-label">Order number format</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input className="field-input" style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
                value={orders.number_format} onChange={e => setOrders({ ...orders, number_format: e.target.value })} />
              <div className="format-preview">
                <span className="format-preview-label">Preview</span>
                <span className="format-preview-value">{previewFmt(orders.number_format)}</span>
              </div>
            </div>
            <div className="field-hint">Use {'{'} SEQ {'}'} for auto-number, {'{'} YYYY {'}'} year, {'{'} MM {'}'} month, {'{'} DD {'}'} day.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SSelect label="Reserve stock at" value={orders.lock_stage} onChange={v => setOrders({ ...orders, lock_stage: v })}
              hint="At which stage should inventory be held for this order?"
              options={[
                { value: 'enquiry',    label: 'Buyer Enquiry' },
                { value: 'sales_order',label: 'Sales Order' },
                { value: 'invoice',    label: 'Invoice' },
              ]} />
            <div className="field">
              <div className="field-label">Auto-generate Invoice PDF</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }}>
                <div className="field-hint" style={{ margin: 0 }}>Creates a PDF when an invoice is confirmed</div>
                <Toggle value={orders.invoice_pdf} onChange={v => setOrders({ ...orders, invoice_pdf: v })} />
              </div>
            </div>
          </div>
        </div>

        <SubSection label="Order stages — enable the ones you use" />
        <SubItem label="Buyer Enquiries"
          desc="Buyers submit enquiries before you confirm. Good for quote-heavy workflows."
          right={<Toggle value={orders.enquiries} onChange={v => setOrders({ ...orders, enquiries: v })} />} />
        <SubItem label="Sales Orders"
          desc="Add a confirmed Sales Order stage between enquiry and invoice."
          right={<Toggle value={orders.sales_orders} onChange={v => setOrders({ ...orders, sales_orders: v })} />} />
        <SubItem label="Invoices"
          desc="Enable invoice creation and tracking. Works independently of the other stages."
          right={<Toggle value={orders.invoices} onChange={v => setOrders({ ...orders, invoices: v })} />} />
      </div>

      {/* ══ BUYER APP ══ */}
      <div className="feature-card">
        <FeatHeader icon="smartphone" title="Buyer App" enabled={app.enabled} onToggle={v => setApp({ ...app, enabled: v })}
          desc="A WhatsApp-authenticated web app for buyers to browse catalogs and place orders." />

        {app.enabled ? (
          <>
            <div className="feature-sub-settings">
              <FRow label="WhatsApp Business Number" required
                hint="Your AiSensy or Interakt number — used to send OTPs to buyers when they log in.">
                <input className="field-input" value={app.whatsapp_number}
                  onChange={e => setApp({ ...app, whatsapp_number: e.target.value })}
                  placeholder="+91 98765 43210" style={{ fontFamily: 'var(--font-mono)' }} />
              </FRow>
            </div>
            <SubSection label="Buyer experience" />
            <SubItem label="Catalog link expiry"
              desc="Automatically deactivate shared catalog links after a set number of days."
              right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {app.expiry_enabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="number" className="field-input" min={1}
                        value={app.expiry_days} onChange={e => setApp({ ...app, expiry_days: Math.max(1, +e.target.value) })}
                        style={{ width: 64, textAlign: 'center', fontFamily: 'var(--font-mono)', padding: '7px 8px' }} />
                      <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>days</span>
                    </div>
                  )}
                  <Toggle value={app.expiry_enabled} onChange={v => setApp({ ...app, expiry_enabled: v })} />
                </div>
              } />
            <SubItem label="Show credit limit to buyers"
              desc="Displays the buyer's credit balance in their app profile and on order screens."
              right={<Toggle value={app.credit_visible} onChange={v => setApp({ ...app, credit_visible: v })} />} />
            <SubItem label="Show out-of-stock products"
              desc="When off, products with zero inventory are hidden from buyers entirely."
              right={<Toggle value={app.show_oos} onChange={v => setApp({ ...app, show_oos: v })} />} />
          </>
        ) : (
          <div style={{ padding: '14px 20px', background: 'var(--cream-50)', borderTop: '1px solid var(--cream-200)', fontSize: 13, color: 'var(--cream-700)', lineHeight: 1.5 }}>
            Enable the Buyer App to let buyers browse your catalog and place orders via WhatsApp OTP login.
          </div>
        )}
      </div>

      {/* ══ CATALOG & PRICING ══ */}
      <div className="feature-card">
        <FeatHeader icon="tag" title="Catalog & Pricing" enabled={cat.cohort_on || cat.catalog_on}
          desc="Publish catalogs to buyers and set different prices per customer group." />

        {/* Cohort Pricing sub-section */}
        <div className="feature-sub-settings">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream-900)', marginBottom: 3 }}>Cohort Pricing</div>
              <div style={{ fontSize: 12.5, color: 'var(--cream-700)', lineHeight: 1.45, maxWidth: '48ch' }}>Group buyers into cohorts and assign different price lists to each group.</div>
            </div>
            <Toggle value={cat.cohort_on} onChange={v => setCat({ ...cat, cohort_on: v })} />
          </div>
          {cat.cohort_on && (
            <>
              <SSelect label="What price do buyers see in their app?" value={cat.price_vis}
                onChange={v => setCat({ ...cat, price_vis: v })}
                options={[
                  { value: 'discounted_only', label: 'Their discounted price only' },
                  { value: 'show_both',        label: 'Show base price + their price (highlights the discount)' },
                  { value: 'hidden',           label: 'Price hidden — show on request' },
                ]} />
              {tier === 'starter' && lim.cohorts && (
                <WarnBanner>
                  You've used <strong>{USAGE.cohorts} of {lim.cohorts} cohorts</strong> on your Starter plan.{' '}
                  <a href="#billing" style={{ color: 'var(--warning-700)', fontWeight: 600, textDecoration: 'none' }}>Upgrade to Growth →</a>
                </WarnBanner>
              )}
            </>
          )}
        </div>

        {/* Catalog Publishing sub-section */}
        <div className="feature-sub-settings" style={{ borderTop: '1px solid var(--cream-200)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream-900)', marginBottom: 3 }}>Catalog Publishing</div>
              <div style={{ fontSize: 12.5, color: 'var(--cream-700)', lineHeight: 1.45, maxWidth: '48ch' }}>Create shareable catalog links for your buyers. They see products and prices — not your cost.</div>
            </div>
            <Toggle value={cat.catalog_on} onChange={v => setCat({ ...cat, catalog_on: v })} />
          </div>
          {cat.catalog_on && (
            <FRow label="Default catalog link expiry" hint="How many days a shared link stays active. Set to 0 for no expiry.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="number" className="field-input" min={0}
                  value={cat.catalog_expiry} onChange={e => setCat({ ...cat, catalog_expiry: Math.max(0, +e.target.value) })}
                  style={{ width: 80, textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
                <span style={{ fontSize: 13, color: 'var(--cream-700)' }}>
                  {cat.catalog_expiry === 0 ? 'days — links never expire' : `days after sharing`}
                </span>
              </div>
            </FRow>
          )}
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 32 }}>
        <button className="btn btn-ghost">Discard changes</button>
        <button className="btn btn-primary">Save changes</button>
      </div>
    </div>
  );
}
window.SettingsFeatures = SettingsFeatures;
