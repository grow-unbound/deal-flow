// settings/SettingsGeneral.jsx

function SettingsGeneral({ tier }) {
  const { useState } = React;
  const [biz, setBiz] = useState({
    company_name: 'WineYard CCTV', gstin: '27AABCW1234A1Z5',
    line1: '402, Trade Centre', line2: 'Lower Parel',
    city: 'Mumbai', state: 'MH', pincode: '400013',
    phone: '+919876543210', email: 'ops@wineyard.in',
  });
  const [defaults, setDefaults] = useState({ gst: '18', uom: 'PCS' });
  const [notifs, setNotifs] = useState({
    enquiry: true, order_placed: true, order_confirmed: true,
    dispatch: true, catalog_shared: true,
  });
  const [saved, setSaved] = useState(false);

  function save() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  return (
    <div style={{ maxWidth: 740 }}>
      <div className="settings-page-header">
        <h1 className="settings-page-title">General</h1>
        <p className="settings-page-sub">Your business identity, product defaults, and notification preferences.</p>
      </div>

      {/* ── Business Profile ── */}
      <SCard title="Business Profile" icon="building"
        subtitle="Appears on buyer-facing documents, invoices, and the buyer app.">

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, paddingBottom: 18, borderBottom: '1px solid var(--cream-200)' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 14, border: '2px dashed var(--cream-400)',
            background: 'var(--cream-50)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', flexShrink: 0,
          }}>
            <SI name="uploadCloud" size={20} color="var(--cream-500)" />
            <span style={{ fontSize: 10, color: 'var(--cream-500)' }}>Logo</span>
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--cream-900)', marginBottom: 4 }}>Company logo</div>
            <div style={{ fontSize: 12, color: 'var(--cream-700)', lineHeight: 1.5, marginBottom: 10, maxWidth: '44ch' }}>
              PNG, JPG or SVG, up to 2 MB. Used on invoices and in the buyer app.
            </div>
            <button className="btn btn-secondary btn-sm">Upload logo</button>
          </div>
        </div>

        {/* Name + GSTIN */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FRow label="Company name" required>
            <input className="field-input" value={biz.company_name} onChange={e => setBiz({ ...biz, company_name: e.target.value })} />
          </FRow>
          <FRow label="GSTIN" hint="Your 15-character GST Identification Number">
            <input className="field-input" value={biz.gstin} onChange={e => setBiz({ ...biz, gstin: e.target.value })} style={{ fontFamily: 'var(--font-mono)' }} maxLength={15} />
          </FRow>
        </div>

        {/* Address */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream-600)' }}>Registered Address</div>
          <FRow label="Address line 1">
            <input className="field-input" value={biz.line1} onChange={e => setBiz({ ...biz, line1: e.target.value })} />
          </FRow>
          <FRow label="Address line 2">
            <input className="field-input" value={biz.line2} onChange={e => setBiz({ ...biz, line2: e.target.value })} placeholder="Landmark, floor, etc. (optional)" />
          </FRow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 110px', gap: 12 }}>
            <FRow label="City">
              <input className="field-input" value={biz.city} onChange={e => setBiz({ ...biz, city: e.target.value })} />
            </FRow>
            <FRow label="State">
              <input className="field-input" value={biz.state} onChange={e => setBiz({ ...biz, state: e.target.value })} maxLength={2} />
            </FRow>
            <FRow label="Pincode">
              <input className="field-input" value={biz.pincode} onChange={e => setBiz({ ...biz, pincode: e.target.value })} style={{ fontFamily: 'var(--font-mono)' }} maxLength={6} />
            </FRow>
          </div>
        </div>

        {/* Phone + Email */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FRow label="Business phone" hint="WhatsApp sender number for OTP messages to buyers">
            <input className="field-input" value={biz.phone} type="tel" onChange={e => setBiz({ ...biz, phone: e.target.value })} style={{ fontFamily: 'var(--font-mono)' }} />
          </FRow>
          <FRow label="Business email" hint="Reply-to address on order confirmation emails">
            <input className="field-input" value={biz.email} type="email" onChange={e => setBiz({ ...biz, email: e.target.value })} />
          </FRow>
        </div>
      </SCard>

      {/* ── Product Defaults ── */}
      <SCard title="Product Defaults" icon="tag"
        subtitle="Starting values that pre-fill when you create a new product category. Change them per category anytime."
        footer={
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <SI name="info" size={13} color="var(--cream-500)" />
            <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>These only apply to new categories — existing ones are not affected.</span>
          </div>
        }>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <SSelect label="Default GST rate" value={defaults.gst} onChange={v => setDefaults({ ...defaults, gst: v })}
            hint="Most of your products are likely in one slab — set it here to save time."
            options={[
              { value: '0',  label: '0% — Exempt' },
              { value: '5',  label: '5% — Essential goods' },
              { value: '12', label: '12% — Standard goods' },
              { value: '18', label: '18% — Standard services' },
              { value: '28', label: '28% — Luxury / demerit' },
            ]} />
          <SSelect label="Default unit of measurement" value={defaults.uom} onChange={v => setDefaults({ ...defaults, uom: v })}
            hint="How you typically sell — can be changed per category."
            options={[
              { value: 'PCS',  label: 'PCS — Piece' },
              { value: 'BOX',  label: 'BOX — Box' },
              { value: 'CASE', label: 'CASE — Case' },
              { value: 'KG',   label: 'KG — Kilogram' },
              { value: 'LTR',  label: 'LTR — Litre' },
              { value: 'MTR',  label: 'MTR — Metre' },
            ]} />
        </div>
      </SCard>

      {/* ── WhatsApp Notifications ── */}
      <SCard title="WhatsApp Notifications" icon="bell"
        subtitle="Each message uses one WhatsApp credit. Turn off anything that isn't useful for your workflow."
        footer={
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <SI name="info" size={13} color="var(--cream-500)" />
            <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>
              Requires Buyer App to be enabled. Credits are managed in{' '}
              <a href="#" style={{ color: 'var(--teal-500)', fontWeight: 500, textDecoration: 'none' }}>Billing &amp; Plan</a>.
            </span>
          </div>
        }>
        <TRow label="New buyer enquiry" desc="Notifies you when a buyer submits an enquiry via the app" value={notifs.enquiry} onChange={v => setNotifs({ ...notifs, enquiry: v })} />
        <TRow label="Order placed by buyer" desc="Notifies you when a buyer places an order" value={notifs.order_placed} onChange={v => setNotifs({ ...notifs, order_placed: v })} />
        <TRow label="Order confirmed — notify buyer" desc="Sends a WhatsApp confirmation to the buyer when you confirm their order" value={notifs.order_confirmed} onChange={v => setNotifs({ ...notifs, order_confirmed: v })} />
        <TRow label="Order dispatched — notify buyer" desc="Sends a dispatch update to the buyer when you mark an order as dispatched" value={notifs.dispatch} onChange={v => setNotifs({ ...notifs, dispatch: v })} />
        <TRow label="Catalog shared — notify buyer" desc="Notifies the buyer when you create a catalog share link for them" value={notifs.catalog_shared} onChange={v => setNotifs({ ...notifs, catalog_shared: v })} />
        <TRow label="OTP delivery" desc="Login passcode sent to buyers when they sign in. Cannot be turned off." systemOn />
      </SCard>

      {/* Save bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 32 }}>
        <button className="btn btn-ghost">Discard changes</button>
        <button className="btn btn-primary" onClick={save}>
          {saved
            ? <><SI name="check" size={14} color="#fff" stroke={2.5} /> Saved</>
            : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
window.SettingsGeneral = SettingsGeneral;
