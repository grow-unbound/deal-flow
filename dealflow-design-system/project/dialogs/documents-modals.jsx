// dialogs/documents-modals.jsx — Tier-1 lifecycle modals that pair with
// the document composer. All four follow the existing modal idiom.
//
//   1. Convert estimate → SO (line picker)
//   2. Mark invoice as paid (date · mode · reference)
//   3. Void invoice (typed-confirm)
//   4. Send via WhatsApp / Email (recipient + preview)

/* Dimmed faux-doc backdrop — gives the modal context without recreating the whole composer. */
function FauxDocBackdrop({ kind = 'invoice', docNumber = 'INV-2026-00091' }) {
  return (
    <div style={{ position: 'absolute', inset: 0, filter: 'blur(1.5px) brightness(0.96)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--cream-100)' }}></div>
      {/* Top bar */}
      <div style={{
        height: 56, borderBottom: '1px solid var(--cream-300)', background: 'var(--cream-50)',
        display: 'flex', alignItems: 'center', padding: '0 28px', gap: 14, fontSize: 12, color: 'var(--cream-700)',
      }}>
        <span>Sales</span><span>/</span><span>{KIND[kind].crumbList}</span><span>/</span>
        <span style={{ color: 'var(--cream-900)', fontFamily: 'var(--font-mono)' }}>{docNumber}</span>
        <span className={`doc-type-chip ${KIND[kind].chipClass}`}><span className="dot"></span>{KIND[kind].label}</span>
      </div>
      {/* Title row */}
      <div style={{ padding: '22px 28px 18px' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500,
          letterSpacing: '-0.015em', color: 'var(--cream-900)',
        }}>{KIND[kind].titleSentVerb}</div>
      </div>
      {/* Faked doc strip */}
      <div style={{
        margin: '0 28px 18px', height: 64, background: '#fff',
        border: '1px solid var(--cream-300)', borderRadius: 14,
      }}></div>
      {/* Faked 3-col body skeleton */}
      <div style={{
        display: 'grid', gridTemplateColumns: '260px 1fr 320px', gap: 18, padding: '0 28px',
      }}>
        <div style={{ height: 380, background: '#fff', border: '1px solid var(--cream-300)', borderRadius: 14 }}></div>
        <div style={{ height: 380, background: '#fff', border: '1px solid var(--cream-300)', borderRadius: 14 }}></div>
        <div style={{ height: 380, background: '#fff', border: '1px solid var(--cream-300)', borderRadius: 14 }}></div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   1 · CONVERT ESTIMATE → SALES ORDER
   ─────────────────────────────────────────────────────────── */
function ModalConvertEstimateToSO() {
  const lines = [
    { sku: 'SKU-2026-00471', qty: 12, amt: 13452, checked: true },
    { sku: 'SKU-2026-00481', qty: 6,  amt: 9720,  checked: true },
    { sku: 'SKU-2026-00611', qty: 6,  amt: 2304,  checked: true },
    { sku: 'SKU-2026-00702', qty: 4,  amt: 2160,  checked: false },
  ];
  const incl = lines.filter(l => l.checked);
  const total = incl.reduce((s, l) => s + l.amt, 0);

  return (
    <div className="ab">
      <FauxDocBackdrop kind="estimate" docNumber="EST-2026-00128" />
      <div className="ab-scrim"></div>

      <div className="modal modal--wide" style={{ width: 600 }}>
        <div className="modal-head modal-head--icon">
          <div className="modal-icon modal-icon--info">
            <Icon name="arrowRight" size={18} stroke={1.6} />
          </div>
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>From estimate · EST‑2026‑00128</div>
            <h2 className="ov-title" style={{ fontSize: 19 }}>Convert to sales order</h2>
            <p className="ov-sub" style={{ marginTop: 6 }}>
              Confirms the order with <strong style={{ color: 'var(--cream-900)' }}>Bharat Stores</strong> and reserves stock.
              Pick which lines roll over — anything left stays on the estimate.
            </p>
          </div>
          <button className="ov-close"><Icon name="x" size={16} /></button>
        </div>

        <div className="modal-body" style={{ paddingTop: 14 }}>
          <div className="convert-list">
            <div className="row" style={{ background: 'var(--cream-50)', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--cream-700)', fontWeight: 600 }}>
              <span></span>
              <span>Product</span>
              <span style={{ textAlign: 'right' }}>Qty</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
            </div>
            {lines.map(l => {
              const p = findP(l.sku);
              return (
                <div key={l.sku} className={'row' + (l.checked ? '' : ' is-deselected')}>
                  <input type="checkbox" defaultChecked={l.checked} />
                  <div>
                    <div className="name">{p.name}</div>
                    <div className="sku">{p.sku}</div>
                  </div>
                  <div className="qty">{l.qty}</div>
                  <div className="amt">{inr(l.amt)}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label">Expected delivery</label>
              <input className="field-input" defaultValue="13 Jun 2026" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label">SO number</label>
              <input className="field-input" defaultValue="SO-2026-00057" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>

          <div style={{
            marginTop: 14,
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '10px 14px',
            background: 'var(--cream-50)',
            border: '1px solid var(--cream-300)',
            borderRadius: 10,
            fontSize: 13,
          }}>
            <span style={{ color: 'var(--cream-700)' }}>{incl.length} of {lines.length} lines rolling over</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: 'var(--cream-900)' }}>{inr(total)}</span>
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12.5, color: 'var(--cream-800)' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal-500)' }} />
            Keep the estimate open for the remaining 1 line
          </label>
        </div>

        <div className="modal-foot">
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">
            <Icon name="arrowRight" size={14} />
            Create SO-2026-00057
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   2 · MARK INVOICE AS PAID
   ─────────────────────────────────────────────────────────── */
function ModalMarkInvoicePaid() {
  return (
    <div className="ab">
      <FauxDocBackdrop kind="invoice" docNumber="INV-2026-00091" />
      <div className="ab-scrim"></div>

      <div className="modal">
        <div className="modal-head modal-head--icon">
          <div className="modal-icon" style={{ background: 'var(--success-50)', color: 'var(--success-700)' }}>
            <Icon name="check" size={18} stroke={2} />
          </div>
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>Invoice · INV‑2026‑00091</div>
            <h2 className="ov-title" style={{ fontSize: 19 }}>Mark as paid</h2>
            <p className="ov-sub" style={{ marginTop: 6 }}>
              Record a payment from <strong style={{ color: 'var(--cream-900)' }}>Bharat Stores</strong>.
              Full or partial — we'll keep the invoice open until the balance is zero.
            </p>
          </div>
          <button className="ov-close"><Icon name="x" size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label className="field-label">Amount received</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="field-input" defaultValue="₹35,478.00"
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 500 }} />
              <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>Full amount</button>
            </div>
            <div className="field-hint">Invoice total ₹35,478 · 0 paid · ₹35,478 due</div>
          </div>

          <div className="field-grid">
            <div className="field">
              <label className="field-label">Payment date</label>
              <input className="field-input" defaultValue="6 Jun 2026" />
            </div>
            <div className="field">
              <label className="field-label">Method</label>
              <select className="field-select" defaultValue="upi">
                <option value="upi">UPI</option>
                <option value="bank">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div className="field field-full">
              <label className="field-label">Reference</label>
              <input className="field-input" defaultValue="UPI/406572198432" style={{ fontFamily: 'var(--font-mono)' }} />
              <div className="field-hint">Optional — UPI ref, cheque number, or bank reference. Shows on the receipt.</div>
            </div>
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--cream-800)' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal-500)' }} />
            Send receipt to Bharat Stores by WhatsApp
          </label>
        </div>

        <div className="modal-foot">
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">
            <Icon name="check" size={14} stroke={2} />
            Record payment
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   3 · VOID INVOICE  (typed-confirm)
   ─────────────────────────────────────────────────────────── */
function ModalVoidInvoice() {
  return (
    <div className="ab">
      <FauxDocBackdrop kind="invoice" docNumber="INV-2026-00091" />
      <div className="ab-scrim"></div>

      <div className="modal">
        <div className="modal-head modal-head--icon">
          <div className="modal-icon modal-icon--danger">
            <Icon name="alertTriangle" size={18} stroke={1.6} />
          </div>
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4, color: 'var(--danger-700)' }}>Irreversible</div>
            <h2 className="ov-title" style={{ fontSize: 19 }}>Void this invoice?</h2>
            <p className="ov-sub" style={{ marginTop: 6 }}>
              Voiding marks <strong style={{ color: 'var(--cream-900)' }}>INV‑2026‑00091</strong> as cancelled
              and notifies the buyer. The GST entry is reversed in the next Tally export.
              Voided invoices stay in the ledger — they can't be edited or deleted.
            </p>
          </div>
          <button className="ov-close"><Icon name="x" size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="confirm-list">
            <div className="row">
              <span className="dot"></span>
              <span>The buyer's portal will show this invoice as voided</span>
            </div>
            <div className="row">
              <span className="dot"></span>
              <span>Any payments already received will need to be refunded separately</span>
            </div>
            <div className="row">
              <span className="dot"></span>
              <span>Tally export reverses the entry on next sync</span>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Reason for voiding</label>
            <select className="field-select" defaultValue="error">
              <option value="error">Raised in error</option>
              <option value="dup">Duplicate of another invoice</option>
              <option value="cancelled">Buyer cancelled the order</option>
              <option value="other">Other (write a note)</option>
            </select>
          </div>

          <div className="typed-input">
            <label className="field-label">Type <code style={{ fontFamily: 'var(--font-mono)' }}>INV-2026-00091</code> to confirm</label>
            <input className="field-input" placeholder="INV-2026-00091" style={{ fontFamily: 'var(--font-mono)' }} />
            <div className="hint">A specific match enables the Void button.</div>
          </div>
        </div>

        <div className="modal-foot">
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-disabled" disabled>
            <Icon name="trash" size={14} />
            Void invoice
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   4 · SEND VIA WHATSAPP / EMAIL
   ─────────────────────────────────────────────────────────── */
function ModalSendInvoice() {
  return (
    <div className="ab">
      <FauxDocBackdrop kind="invoice" docNumber="INV-2026-00091" />
      <div className="ab-scrim"></div>

      <div className="modal modal--wide" style={{ width: 580 }}>
        <div className="modal-head modal-head--icon">
          <div className="modal-icon modal-icon--info">
            <DocIcon name="send" size={18} stroke={1.6} />
          </div>
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>Invoice · INV‑2026‑00091</div>
            <h2 className="ov-title" style={{ fontSize: 19 }}>Send to Bharat Stores</h2>
            <p className="ov-sub" style={{ marginTop: 6 }}>
              Sending locks GSTIN and HSN on the PDF. We'll record the send to the activity log.
            </p>
          </div>
          <button className="ov-close"><Icon name="x" size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="channel-tabs">
            <button className="is-on">
              <DocIcon name="whatsapp" size={13} />
              WhatsApp
            </button>
            <button>
              <Icon name="mail" size={13} />
              Email
            </button>
            <button>
              <DocIcon name="printer" size={13} />
              Download only
            </button>
          </div>

          <div className="field-grid">
            <div className="field field-full">
              <label className="field-label">Send to</label>
              <div className="combo-input">
                <BAv hue="teal" label="SB" size={22} />
                <input defaultValue="Suresh Bharat · +91 98101 22433" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }} />
                <button className="ib-clear" style={{ background: 'transparent', border: 'none', color: 'var(--cream-700)' }}>
                  <Icon name="chevronDown" size={13} />
                </button>
              </div>
              <div className="field-hint">Admin contact on file. Also cc: <strong style={{ color: 'var(--cream-900)' }}>Anita Bharat · +91 98101 22877</strong>.</div>
            </div>
            <div className="field field-full">
              <label className="field-label">Message</label>
              <textarea className="field-textarea" style={{ minHeight: 70 }} defaultValue="Hi Suresh, sharing invoice INV-2026-00091 for ₹35,478 due 24 Jun. Reply if you need anything changed."></textarea>
              <div className="field-hint">A polite default — edit freely. The PDF attaches automatically.</div>
            </div>
          </div>

          <div className="preview-stage">
            <div className="preview-head">
              <span className="l">Preview · what the buyer will see</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cream-700)' }}>WhatsApp · in 2 min</span>
            </div>
            <div className="preview-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 500 }}>DealFlow · Phani Raju</strong>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cream-700)' }}>2:14 PM</span>
              </div>
              <div className="greet">Hi Suresh, sharing invoice <strong style={{ color: 'var(--cream-900)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>INV-2026-00091</strong> for <strong style={{ color: 'var(--cream-900)' }}>₹35,478</strong> due <strong style={{ color: 'var(--cream-900)' }}>24 Jun</strong>. Reply if you need anything changed.</div>
              <div style={{
                marginTop: 8, padding: '8px 10px', background: 'var(--cream-50)',
                border: '1px solid var(--cream-300)', borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
              }}>
                <Icon name="fileText" size={14} color="var(--teal-500)" />
                <span style={{ flex: 1, color: 'var(--cream-900)', fontWeight: 500 }}>INV-2026-00091.pdf</span>
                <span className="sig" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>128 KB</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-secondary">Schedule</button>
          <button className="btn btn-primary">
            <DocIcon name="send" size={13} />
            Send now
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  FauxDocBackdrop,
  ModalConvertEstimateToSO,
  ModalMarkInvoicePaid,
  ModalVoidInvoice,
  ModalSendInvoice,
});
