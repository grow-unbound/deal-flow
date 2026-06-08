// dialogs/documents-states.jsx — The 7 composer states + rationale card.
// Uses helpers from dialogs/documents.jsx and shared chrome from dialogs/composers.jsx.

/* ──────────────── RATIONALE ──────────────── */
function DocRationale() {
  return (
    <div className="ab">
      <div className="doc-rationale">
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--cream-700)', marginBottom: 8,
          }}>Documents · System</div>
          <h2>One composer. Three documents. Create / Edit / View, all the same chrome.</h2>
          <div className="sub" style={{ marginTop: 8 }}>
            Estimates, sales orders, and invoices share <strong style={{ color: 'var(--cream-900)' }}>~85% of their fields</strong>.
            We reuse the composer pattern from pricelists, cohorts, and catalogs — same three‑column body
            (buyer · lines · totals + insights), same auto‑saved draft, same back‑button.
            Type chip, doc‑# prefix, and the second date label switch by kind. Edit mode flags the diffs;
            View mode locks the inputs and swaps the action bar for lifecycle.
          </div>
        </div>

        <div className="cols">
          <div className="card">
            <div className="tag doc-type-chip doc-type-chip--estimate">
              <span className="dot"></span>Estimate
            </div>
            <div className="title">Quote a buyer</div>
            <p>A pre‑sale proposal. Lives long, gets re‑opened, often gets converted.</p>
            <ul>
              <li className="is-e"><strong>EST‑YYYY‑NNNNN</strong> doc number, with a <em>Valid until</em> date</li>
              <li className="is-e">Primary action: <em>Send estimate</em> — by email or WhatsApp</li>
              <li className="is-e">When accepted: <em>Convert to sales order</em> carries every line</li>
              <li className="is-e">No GST commitment yet (preview only)</li>
            </ul>
          </div>

          <div className="card">
            <div className="tag doc-type-chip doc-type-chip--so">
              <span className="dot"></span>Sales order
            </div>
            <div className="title">Confirm and reserve</div>
            <p>The buyer said yes. We lock the lines, reserve stock, and start fulfilment.</p>
            <ul>
              <li className="is-so"><strong>SO‑YYYY‑NNNNN</strong> doc number, with an <em>Expected delivery</em> date</li>
              <li className="is-so">Primary action: <em>Confirm order</em> — reserves stock against the buyer</li>
              <li className="is-so">Stock validation lives here — over‑stock warnings appear inline</li>
              <li className="is-so">When dispatched (full or partial): <em>Convert to invoice</em></li>
            </ul>
          </div>

          <div className="card">
            <div className="tag doc-type-chip doc-type-chip--invoice">
              <span className="dot"></span>Invoice
            </div>
            <div className="title">Bill and collect</div>
            <p>The receivable. GST commitment, due date, and the system‑of‑record for Tally export.</p>
            <ul>
              <li className="is-inv"><strong>INV‑YYYY‑NNNNN</strong> doc number, with a <em>Due date</em></li>
              <li className="is-inv">Primary action: <em>Send invoice</em> — locks GSTIN and HSN at send time</li>
              <li className="is-inv">Lifecycle: Sent → Partially paid → Paid · or Void</li>
              <li className="is-inv">Tally / Busy CSV maps from here in Phase 1</li>
            </ul>
          </div>
        </div>

        <div className="shared">
          <Icon name="info" size={16} color="var(--teal-500)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Why a composer, not a slide‑over.</strong>
            {' '}A transactional document needs the user to see <em>other data</em> while filling it in —
            the buyer's pricelist, their credit headroom, scheme savings, stock availability per line.
            That's the deciding question in our overlay system (read: <em>System · Three tiers</em> above).
            A slide‑over works for a single‑entity create with no surrounding data; a document fails that test.
            Same as Pricelist / Cohort / Catalog — same composer, different rows.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── STATE 1 · EMPTY (just opened, no buyer) ──────────────── */
function DocComposerEstimateEmpty() {
  return (
    <div className="ab">
      <div className="composer">
        <DocTop
          kind="estimate"
          docNumber={null}
          autoSave={{ label: 'Draft created · 2 sec ago', dot: { background: 'var(--success-500)' } }}
          modeChip={{ tone: 'draft', label: 'Draft' }}
        />
        <div>
          <DocTitleRow
            kind="estimate"
            mode="create"
            subtitle="Pick a buyer to start — pricelist, credit, and place of supply auto-apply."
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="download" size={13} />
                  Import CSV
                </button>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="sparkle" size={13} />
                  Copy from another estimate
                </button>
              </div>
            }
          />

          <DocStrip
            kind="estimate"
            docNumber="EST-2026-00128"
            date="6 Jun 2026"
            secondDate="20 Jun 2026"
            refPO={null}
            posState="— (pick buyer)"
          />

          <div className="composer-body">
            <BuyerCardEmpty focused />
            <div className="doc-lines">
              <div className="doc-lines-head">
                <div>
                  <div className="title">Pick a buyer first</div>
                  <div className="sub">Lines appear here once a buyer is chosen.</div>
                </div>
              </div>
              <div className="lines-empty" style={{ padding: '64px 24px' }}>
                <div className="illus"><Icon name="users" size={26} stroke={1.25} /></div>
                <h4>Waiting on the buyer</h4>
                <p>The pricelist that's applied — and the products you can add — depend on which buyer this is for.</p>
              </div>
            </div>
            <TotalsStack>
              <TotalsCard lines={[]} />
            </TotalsStack>
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta">
            <span className="dot"></span>
            Auto‑saves as you type · resumes on reload
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Discard draft</button>
          <button className="btn btn-disabled" disabled>
            <DocIcon name="send" size={13} />
            Send estimate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── STATE 2 · BUYER PICKED, NO LINES ──────────────── */
function DocComposerEstimateBuyer() {
  return (
    <div className="ab">
      <div className="composer">
        <DocTop
          kind="estimate"
          docNumber="EST-2026-00128"
          autoSave={{ label: 'Draft saved · 4 sec ago', dot: { background: 'var(--success-500)' } }}
          modeChip={{ tone: 'draft', label: 'Draft' }}
        />
        <div>
          <DocTitleRow
            kind="estimate"
            mode="create"
            subtitle={<>For <strong style={{ color: 'var(--cream-900)' }}>{BUYER.name}</strong> — start adding products in the search row.</>}
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="download" size={13} />
                  Import CSV
                </button>
              </div>
            }
          />

          <DocStrip
            kind="estimate"
            docNumber="EST-2026-00128"
            date="6 Jun 2026"
            secondDate="20 Jun 2026"
            refPO={null}
            posState="Delhi (intra-state)"
          />

          <div className="composer-body">
            <BuyerCardFilled />
            <LinesTable lines={[]} showAddRow addRowProps={{ open: false, searchTerm: '' }} emptyMsg="Pricelist is ready. Type product name or SKU in the search row above to add your first line." />
            <TotalsStack>
              <TotalsCard lines={[]} />
              <InsightsCard buyer={BUYER} creditState="ok" addToCart={0} />
            </TotalsStack>
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta">
            <span className="dot"></span>
            Draft saved · auto‑resumes if you close
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Discard draft</button>
          <button className="btn btn-secondary">Save & close</button>
          <button className="btn btn-disabled" disabled>
            <DocIcon name="send" size={13} />
            Send estimate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── STATE 3 · IN PROGRESS (4 lines, summary live) ──────────────── */
function DocComposerEstimateInProgress() {
  const lines = [
    { sku: 'SKU-2026-00471', qty: 12, price: 1180, discPct: 5, taxPct: 18, scheme: 'Buy 12, get 1 free' },
    { sku: 'SKU-2026-00481', qty: 6,  price: 1620, discPct: 0, taxPct: 18 },
    { sku: 'SKU-2026-00611', qty: 6,  price: 384,  discPct: 0, taxPct: 18 },
    { sku: 'SKU-2026-00702', qty: 4,  price: 540,  discPct: 0, taxPct: 12 },
  ];
  // subtotal ~ 26,532; addToCart total approx after tax ~ 30,500
  return (
    <div className="ab">
      <div className="composer">
        <DocTop
          kind="estimate"
          docNumber="EST-2026-00128"
          autoSave={{ label: 'Draft saved · 6 sec ago by Phani', dot: { background: 'var(--success-500)' } }}
          modeChip={{ tone: 'draft', label: 'Draft' }}
        />
        <div>
          <DocTitleRow
            kind="estimate"
            mode="create"
            subtitle={<>For <strong style={{ color: 'var(--cream-900)' }}>{BUYER.name}</strong> — review the totals on the right, then send.</>}
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm">
                  <DocIcon name="printer" size={13} />
                  Preview PDF
                </button>
              </div>
            }
          />

          <DocStrip
            kind="estimate"
            docNumber="EST-2026-00128"
            date="6 Jun 2026"
            secondDate="20 Jun 2026"
            refPO="PO/BS/06-128"
            posState="Delhi (intra-state)"
          />

          <div className="composer-body">
            <BuyerCardFilled addToCart={32600} />
            <LinesTable lines={lines} showAddRow addRowProps={{ open: false }} />
            <TotalsStack>
              <TotalsCard lines={lines} discountFlat={500} freight={250} />
              <InsightsCard buyer={BUYER} schemeSavings={1180} creditState="ok" addToCart={32600} />
            </TotalsStack>
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta">
            <span className="dot"></span>
            Draft saved · last edit 6 sec ago by Phani
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Discard draft</button>
          <button className="btn btn-secondary">Save & close</button>
          <button className="btn btn-primary">
            <DocIcon name="send" size={13} />
            Send estimate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── STATE 4 · EDIT MODE (existing invoice, diff markers) ──────────────── */
function DocComposerInvoiceEdit() {
  const lines = [
    { sku: 'SKU-2026-00471', qty: 12, price: 1180, discPct: 5, taxPct: 18, status: 'changed', wasPrice: 1240 },
    { sku: 'SKU-2026-00481', qty: 6,  price: 1620, discPct: 0, taxPct: 18, status: 'normal' },
    { sku: 'SKU-2026-00611', qty: 6,  price: 384,  discPct: 0, taxPct: 18, status: 'added' },
    { sku: 'SKU-2026-00702', qty: 4,  price: 540,  discPct: 0, taxPct: 12, status: 'removed' },
  ];
  return (
    <div className="ab">
      <div className="composer">
        <DocTop
          kind="invoice"
          docNumber="INV-2026-00091"
          autoSave={{ label: '3 unsaved changes · 12 sec ago', dot: { background: 'var(--ember-400)' } }}
          modeChip={{ tone: 'edit', label: 'Editing · was sent' }}
        />
        <div>
          <DocTitleRow
            kind="invoice"
            mode="edit"
            subtitle={
              <span>
                You're editing an invoice that's already been sent to <strong style={{ color: 'var(--cream-900)' }}>Bharat Stores</strong>.
                Saving will bump it to <strong style={{ color: 'var(--cream-900)' }}>v2</strong> and notify the buyer.
                Modified lines are flagged.
              </span>
            }
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm">
                  <DocIcon name="rotateCcw" size={13} />
                  Revert all
                </button>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="fileText" size={13} />
                  Activity log
                </button>
              </div>
            }
          />

          <DocStrip
            kind="invoice"
            docNumber="INV-2026-00091"
            date="3 Jun 2026"
            secondDate="24 Jun 2026"
            refPO="PO/BS/06-121"
            posState="Delhi (intra-state)"
          />

          <div className="composer-body">
            <BuyerCardFilled />
            <LinesTable lines={lines} mode="edit" showAddRow addRowProps={{ open: false }} />
            <TotalsStack>
              <TotalsCard lines={lines} discountFlat={500} freight={250} mode="edit" diff={{ subtotal: 28452, tax: 5121, total: 33823 }} />
              <div className="callout callout--warning">
                <Icon name="alertTriangle" size={15} stroke={1.6} color="var(--warning-500)" className="ico" />
                <div>
                  <strong>Saving notifies the buyer.</strong> v1 was viewed 2 days ago.
                  We'll mark the old PDF superseded and send v2 by the same channel.
                </div>
              </div>
              <InsightsCard buyer={BUYER} schemeSavings={1180} creditState="ok" addToCart={29950} />
            </TotalsStack>
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta" style={{ color: 'var(--ember-700)' }}>
            <span className="dot" style={{ background: 'var(--ember-400)' }}></span>
            3 unsaved changes · last edit 12 sec ago by Phani
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Discard changes</button>
          <button className="btn btn-secondary">Save as draft</button>
          <button className="btn btn-primary">
            <DocIcon name="send" size={13} />
            Save & resend
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── STATE 5 · STOCK WARNING (sales order, one line over stock) ──────────────── */
function DocComposerSOStockWarning() {
  const lines = [
    { sku: 'SKU-2026-00482', qty: 24, price: 1340, discPct: 0, taxPct: 18, stockWarn: true, stockAvail: 18 },
    { sku: 'SKU-2026-00481', qty: 8,  price: 1620, discPct: 0, taxPct: 18 },
    { sku: 'SKU-2026-00472', qty: 6,  price: 920,  discPct: 5, taxPct: 18 },
  ];
  return (
    <div className="ab">
      <div className="composer">
        <DocTop
          kind="so"
          docNumber="SO-2026-00057"
          autoSave={{ label: 'Draft saved · 3 sec ago', dot: { background: 'var(--success-500)' } }}
          modeChip={{ tone: 'draft', label: 'Draft' }}
        />
        <div>
          <DocTitleRow
            kind="so"
            mode="create"
            subtitle={<>For <strong style={{ color: 'var(--cream-900)' }}>{BUYER.name}</strong> — one line exceeds available stock.</>}
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="package" size={13} />
                  Stock report
                </button>
              </div>
            }
          />

          <DocStrip
            kind="so"
            docNumber="SO-2026-00057"
            date="6 Jun 2026"
            secondDate="13 Jun 2026"
            refPO="PO/BS/06-129"
            posState="Delhi (intra-state)"
          />

          <div className="composer-body">
            <BuyerCardFilled addToCart={50200} />
            <LinesTable lines={lines} showAddRow addRowProps={{ open: false }} />
            <TotalsStack>
              <div className="callout callout--warning">
                <Icon name="alertTriangle" size={15} stroke={1.6} color="var(--warning-500)" className="ico" />
                <div>
                  <strong>1 line over stock.</strong> Casa del Sol Albariño · ordered <strong>24</strong>, only <strong>18</strong> on hand.
                  Options: <em>backorder the 6</em>, <em>split into two SOs</em>, or <em>cut the line to 18</em>.
                </div>
              </div>
              <TotalsCard lines={lines} freight={400} />
              <InsightsCard buyer={BUYER} creditState="ok" addToCart={50200} />
            </TotalsStack>
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta">
            <span className="dot"></span>
            Draft saved · resolve the stock warning before confirming
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Discard</button>
          <button className="btn btn-secondary">Save & close</button>
          <button className="btn btn-secondary" style={{ borderColor: 'var(--warning-500)', color: 'var(--warning-700)' }}>
            <Icon name="check" size={13} stroke={2} />
            Confirm with backorder
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── STATE 6 · CREDIT LIMIT WARNING ──────────────── */
function DocComposerEstimateCreditWarn() {
  const lines = [
    { sku: 'SKU-2026-00481', qty: 30, price: 1620, discPct: 0,  taxPct: 18 },
    { sku: 'SKU-2026-00471', qty: 24, price: 1180, discPct: 5,  taxPct: 18, scheme: 'Buy 12, get 1 free' },
    { sku: 'SKU-2026-00482', qty: 12, price: 1340, discPct: 0,  taxPct: 18 },
  ];
  // subtotal ~ 91k; tax ~ 16k; total ~ 107k.  Buyer used 160k of 250k → adding 107k = 267k → ₹17k over.
  return (
    <div className="ab">
      <div className="composer">
        <DocTop
          kind="estimate"
          docNumber="EST-2026-00128"
          autoSave={{ label: 'Draft saved · 8 sec ago', dot: { background: 'var(--success-500)' } }}
          modeChip={{ tone: 'draft', label: 'Draft' }}
        />
        <div>
          <DocTitleRow
            kind="estimate"
            mode="create"
            subtitle={<>For <strong style={{ color: 'var(--cream-900)' }}>{BUYER.name}</strong> — this estimate exceeds their credit limit.</>}
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm">
                  <DocIcon name="creditCard" size={13} />
                  Credit history
                </button>
              </div>
            }
          />

          <DocStrip
            kind="estimate"
            docNumber="EST-2026-00128"
            date="6 Jun 2026"
            secondDate="20 Jun 2026"
            refPO="PO/BS/06-131"
            posState="Delhi (intra-state)"
          />

          <div className="composer-body">
            <BuyerCardFilled addToCart={107000} isOver />
            <LinesTable lines={lines} showAddRow addRowProps={{ open: false }} />
            <TotalsStack>
              <div className="callout callout--danger">
                <Icon name="alertTriangle" size={15} stroke={1.6} color="var(--danger-500)" className="ico" />
                <div>
                  <strong>Over credit limit by ₹17 K.</strong> Bharat Stores' limit is ₹2.5 L
                  and they've already used ₹1.6 L. Send still allowed for estimates — but converting to SO
                  will need a manager's approval.
                </div>
              </div>
              <TotalsCard lines={lines} discountFlat={2000} freight={400} over />
              <InsightsCard buyer={BUYER} schemeSavings={2360} creditState="over" addToCart={107000} />
            </TotalsStack>
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta" style={{ color: 'var(--danger-700)' }}>
            <span className="dot" style={{ background: 'var(--danger-500)' }}></span>
            Over credit limit · estimate can still be sent for buyer's approval
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Trim lines</button>
          <button className="btn btn-secondary">Request limit raise</button>
          <button className="btn btn-primary">
            <DocIcon name="send" size={13} />
            Send estimate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── STATE 7 · VIEW / READ-ONLY (invoice sent) ──────────────── */
function DocComposerInvoiceSent() {
  const lines = [
    { sku: 'SKU-2026-00471', qty: 12, price: 1180, discPct: 5, taxPct: 18 },
    { sku: 'SKU-2026-00481', qty: 6,  price: 1620, discPct: 0, taxPct: 18 },
    { sku: 'SKU-2026-00611', qty: 6,  price: 384,  discPct: 0, taxPct: 18 },
  ];
  return (
    <div className="ab">
      <div className="composer doc-readonly">
        <DocTop
          kind="invoice"
          docNumber="INV-2026-00091"
          statusChip={
            <span className="doc-status doc-status--sent">
              <span className="dot"></span>
              Sent · awaiting payment
            </span>
          }
          autoSave={null}
        />
        <div>
          <DocTitleRow
            kind="invoice"
            mode="sent"
            subtitle={<>To <strong style={{ color: 'var(--cream-900)' }}>{BUYER.name}</strong> · ₹35,478 due in <strong style={{ color: 'var(--cream-900)' }}>18 days</strong>.</>}
            rightActions={
              <div className="doc-actions">
                <button className="btn btn-ghost btn-sm">
                  <DocIcon name="printer" size={13} />
                  Download PDF
                </button>
                <button className="btn btn-ghost btn-sm">
                  <DocIcon name="send" size={13} />
                  Send again
                </button>
                <button className="btn btn-secondary btn-sm">
                  <Icon name="check" size={13} stroke={2} />
                  Mark as paid
                </button>
                <button className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0, justifyContent: 'center' }}>
                  <Icon name="moreVertical" size={14} />
                </button>
              </div>
            }
          />

          {/* Activity trail — what's happened to this invoice */}
          <div className="doc-trail">
            <span><strong>Sent</strong> via WhatsApp · 2 hours ago by Phani</span>
            <span className="sep">·</span>
            <span><strong>Seen</strong> by buyer · 24 min ago</span>
            <span className="sep">·</span>
            <span>Tally export · pending next sync</span>
          </div>

          <DocStrip
            kind="invoice"
            docNumber="INV-2026-00091"
            date="6 Jun 2026"
            secondDate="24 Jun 2026"
            refPO="PO/BS/06-128"
            posState="Delhi (intra-state)"
          />

          <div className="composer-body">
            <BuyerCardFilled />
            <LinesTable lines={lines} readOnly />
            <TotalsStack>
              <TotalsCard lines={lines} discountFlat={500} freight={250} />
              <div className="callout callout--info">
                <Icon name="info" size={15} stroke={1.6} color="var(--teal-500)" className="ico" />
                <div>
                  <strong>To edit, click Edit invoice.</strong> Edits bump the version and notify the buyer.
                  Use <em>Void</em> only if this invoice was raised in error.
                </div>
              </div>
              <InsightsCard buyer={BUYER} schemeSavings={1180} creditState="ok" addToCart={0} />
            </TotalsStack>
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta">
            <span className="dot" style={{ background: 'var(--info-500)' }}></span>
            Sent · last viewed by buyer 24 min ago
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost" style={{ color: 'var(--danger-700)' }}>
            <Icon name="trash" size={13} />
            Void invoice
          </button>
          <button className="btn btn-secondary">Edit invoice</button>
          <button className="btn btn-primary">
            <Icon name="check" size={13} stroke={2} />
            Mark as paid
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  DocRationale,
  DocComposerEstimateEmpty,
  DocComposerEstimateBuyer,
  DocComposerEstimateInProgress,
  DocComposerInvoiceEdit,
  DocComposerSOStockWarning,
  DocComposerEstimateCreditWarn,
  DocComposerInvoiceSent,
});
