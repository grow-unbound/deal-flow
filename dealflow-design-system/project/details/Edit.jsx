// details/Edit.jsx — Form-style edit panels for each entity.
// All use the same shared Field / SectionCard primitives.

/* ─── BRAND ────────────────────────────────────────────────── */
function BrandEdit({ d }) {
  return (
    <React.Fragment>
      <SectionCard title="Identity" sub="The basics retailers see in their app">
        <div className="field-grid">
          <Field label="Brand name" value={d.name} required />
          <Field label="Category" value={d.category} />
          <Field label="Region" value={d.region} />
          <Field label="Carried since" value={d.carriedSince} muted />
          <Field label="Default cohort" value={<span className="link">{d.defaultCohort}</span>} />
          <Field label="Master price list" value={<span className="link">{d.masterPriceList}</span>} />
        </div>
      </SectionCard>

      <SectionCard title="Principal contact" sub="Whom Phani calls when something needs unblocking">
        <div className="field-grid">
          <Field label="Contact name" value={d.principalContact.name} />
          <Field label="Role" value={d.principalContact.role} />
          <Field label="Phone" value={d.principalContact.phone} mono />
          <Field label="Email" value={<span className="link">{d.principalContact.email}</span>} />
        </div>
      </SectionCard>

      <SectionCard title="Commercials">
        <div className="field-grid">
          <Field label="GSTIN" value={d.gstin} mono />
          <Field label="Payment terms" value={d.paymentTerms} />
          <Field label="Margin agreement" value={d.marginAgreement} />
          <Field label="Default credit (₹)" value="—" muted />
        </div>
      </SectionCard>

      <SectionCard title="Internal notes" sub="Visible to your team. Not shared with retailers.">
        <div className="field-grid cols-1">
          <Field full multiline label="Notes" value={d.notes} />
        </div>
        <div className="edit-trail">
          <span>Last edited 3 days ago by <strong>Phani Raju</strong></span>
          <span className="link" style={{ fontSize: 12 }}>Activity log →</span>
        </div>
      </SectionCard>
    </React.Fragment>
  );
}

/* ─── PRODUCT ──────────────────────────────────────────────── */
function ProductEdit({ d }) {
  return (
    <React.Fragment>
      <SectionCard title="Identity">
        <div className="field-grid">
          <Field label="Product name" value={d.name} required />
          <Field label="Brand" value={<span className="link">{d.brand}</span>} required />
          <Field label="SKU" value={d.sku} mono />
          <Field label="HSN code" value={d.hsn} mono />
          <Field label="Category" value={d.category} />
          <Field label="Vintage / batch" value={d.vintage} />
        </div>
      </SectionCard>

      <SectionCard title="Packaging">
        <div className="field-grid">
          <Field label="Pack size" value={d.pack} />
          <Field label="Case size" value={d.caseSize} />
          <Field label="Weight" value={d.weight} mono />
          <Field label="Storage" value="Cool & dry" muted />
        </div>
      </SectionCard>

      <SectionCard title="Pricing" sub="Base values; cohort overrides apply on top.">
        <div className="field-grid">
          <Field label="MRP" value={<span className="mono">{inrFmt(d.mrp)}</span>} required />
          <Field label="Base distributor price" value={<span className="mono">{inrFmt(d.basePrice)}</span>} required />
          <Field label="GST rate" value={d.gstRate} />
          <Field label="Min order qty" value="6 bottles" />
        </div>
      </SectionCard>

      <SectionCard title="Description" sub="Shown to retailers in the buyer app">
        <div className="field-grid cols-1">
          <Field full multiline label="Description" value={d.description} />
        </div>
      </SectionCard>

      <SectionCard title="Photos">
        <div style={{ display: 'flex', gap: 10, padding: 4 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              width: 84, height: 84, borderRadius: 10,
              background: 'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 8px',
            }}>
              <div style={{
                width: 18, height: 56,
                borderRadius: '20% 20% 8% 8% / 8% 8% 4% 4%',
                background: 'linear-gradient(180deg, #1F3A34, #142823)',
              }}></div>
            </div>
          ))}
          <div style={{
            width: 84, height: 84, borderRadius: 10,
            border: '1.5px dashed var(--cream-400)',
            color: 'var(--cream-700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            gap: 4, fontSize: 11,
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            <span>Add photo</span>
          </div>
        </div>
      </SectionCard>
    </React.Fragment>
  );
}

/* ─── CUSTOMER (Buyer) ─────────────────────────────────────── */
function CustomerEdit({ d }) {
  return (
    <React.Fragment>
      <SectionCard title="Identity">
        <div className="field-grid">
          <Field label="Business name" value={d.name} required />
          <Field label="Tier" value={
            <span className="pill" style={{ background: 'var(--ember-50)', color: 'var(--ember-700)' }}>
              Tier {d.tier}
            </span>
          } />
          <Field label="City" value={d.city} />
          <Field label="Buyer since" value={d.buyerSince} muted />
          <Field label="Default cohort" value={<span className="link">{d.defaultCohort}</span>} />
          <Field label="Status" value={<StatusTag label={d.status.label} tone={d.status.tone} />} />
        </div>
      </SectionCard>

      <SectionCard title="Primary contact">
        <div className="field-grid">
          <Field label="Contact name" value={d.contact.name} />
          <Field label="Role" value={d.contact.role} />
          <Field label="Phone" value={d.contact.phone} mono />
          <Field label="Email" value={<span className="link">{d.contact.email}</span>} />
        </div>
      </SectionCard>

      <SectionCard title="Tax & terms">
        <div className="field-grid">
          <Field label="GSTIN" value={d.gstin} mono />
          <Field label="PAN" value={d.pan} mono />
          <Field label="Payment terms" value={d.paymentTerms} />
          <Field label="Credit limit" value={<span className="mono">{inrFmt(d.creditLimit)}</span>} />
        </div>
      </SectionCard>

      <SectionCard title="Addresses">
        <div className="field-grid">
          <Field full multiline label="Billing address" value={d.billing} />
          <Field full multiline label="Shipping address" value={d.shipping} />
        </div>
      </SectionCard>

      <SectionCard title="Notes">
        <div className="field-grid cols-1">
          <Field full multiline label="Internal notes" value={d.notes} />
        </div>
      </SectionCard>
    </React.Fragment>
  );
}

/* ─── COHORT ───────────────────────────────────────────────── */
function CohortEdit({ d }) {
  return (
    <React.Fragment>
      <SectionCard title="Identity">
        <div className="field-grid">
          <Field label="Cohort name" value={d.name} required />
          <Field label="Status" value={<StatusTag label={d.status.label} tone={d.status.tone} />} />
          <Field full multiline label="Description" value={d.description} />
        </div>
      </SectionCard>

      <SectionCard title="Membership rules" sub="A buyer joins this cohort automatically if all rules match.">
        <div className="field-grid">
          {d.rules.map(r => (
            <Field key={r.k} label={r.k} value={r.v} />
          ))}
        </div>
        <div className="edit-trail">
          <span>{d.members} buyers currently match these rules.</span>
          <span className="link" style={{ fontSize: 12 }}>Preview members →</span>
        </div>
      </SectionCard>

      <SectionCard title="Defaults">
        <div className="field-grid">
          <Field label="Default price list" value={<span className="link">{d.defaultPriceList}</span>} />
          <Field label="Applicable catalogs" value={d.applicableCatalogs} />
        </div>
      </SectionCard>

      <SectionCard title="Members" sub={`${d.members} of ${d.totalBuyers} buyers`}
        right={<button className="cockpit-btn cockpit-btn-secondary cockpit-btn-sm">Manage members</button>}
      >
        <div className="compact-list">
          {(COHORT_DETAIL.perf.topMembers).slice(0, 3).map((m, i) => (
            <div className="compact-row" key={i}>
              <div className="idx">{i + 1}</div>
              <BrandAvatarSm initials={m.name.split(' ').map(w => w[0]).slice(0,2).join('')} hue={['teal','ember','cream'][i % 3]} size={28} />
              <div className="name">{m.name}<div className="sub">{m.city}</div></div>
              <div className="value">{inrShort(m.spend)}<div className="sub">{m.orders} orders</div></div>
            </div>
          ))}
        </div>
      </SectionCard>
    </React.Fragment>
  );
}

/* ─── CATALOG ──────────────────────────────────────────────── */
function CatalogEdit({ d }) {
  return (
    <React.Fragment>
      <div className="catalog-hero-large h-teal">
        <div>
          <h2>{d.name}</h2>
          <div className="meta">Cohort: {d.cohort} · {d.products} products · Live until {d.validUntil}</div>
        </div>
        <StatusTag label={d.status.label} tone={d.status.tone} />
      </div>

      <SectionCard title="Basics">
        <div className="field-grid">
          <Field label="Catalog name" value={d.name} required />
          <Field label="Cohort" value={<span className="link">{d.cohort} · {d.cohortMembers} buyers</span>} required />
          <Field label="Valid from" value={d.validFrom} />
          <Field label="Valid until" value={d.validUntil} />
          <Field full multiline label="Intro copy"
            value={d.intro} />
        </div>
      </SectionCard>

      <SectionCard title={`Products · ${d.products}`} flush
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="cockpit-btn cockpit-btn-ghost cockpit-btn-sm">Reorder</button>
            <button className="cockpit-btn cockpit-btn-secondary cockpit-btn-sm">Add products</button>
          </div>
        }
      >
        <div className="cat-products">
          {['teal','teal','ember','teal','cream','ember','teal','cream','ember','teal','ember','cream'].map((c, i) => (
            <div key={i} className={`cat-product ${c}`}>
              <div className="b"></div>
            </div>
          ))}
        </div>
        <div className="edit-trail">
          <span>Showing 12 of {d.products} · drag to reorder</span>
          <span className="link" style={{ fontSize: 12 }}>See all →</span>
        </div>
      </SectionCard>

      <SectionCard title="Publish settings">
        <div className="field-grid">
          <Field label="Hero image" value="Default (teal)" />
          <Field label="Published by" value={d.publishedBy} muted />
          <Field label="Published at" value={d.publishedAt} muted />
          <Field label="Notify buyers" value={
            <span className="pill" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}>
              WhatsApp + in-app
            </span>
          } />
        </div>
      </SectionCard>
    </React.Fragment>
  );
}

Object.assign(window, {
  BrandEdit, ProductEdit, CustomerEdit, CohortEdit, CatalogEdit,
});
