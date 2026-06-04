// dialogs/modals.jsx — 4 modal examples covering the full Tier 1 surface area.
//   1. Invite team member   — quick form (Settings → Team)
//   2. Discard changes      — dirty close warning
//   3. Archive pricelist    — simple destructive confirm
//   4. Delete brand         — typed-confirm for irreversible action

/* ───────────────────────────────────────────────────────────
   1 · INVITE TEAM MEMBER  (seller-side, Settings → Team)
   ─────────────────────────────────────────────────────────── */
function ModalInviteMember() {
  return (
    <div className="ab">
      <FakeCockpit section="Settings" dimmed />
      <div className="ab-scrim"></div>

      <div className="modal">
        <div className="modal-head">
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>Team · seller side</div>
            <h2 className="ov-title">Invite a team member</h2>
            <p className="ov-sub" style={{ marginTop: 4 }}>
              They&rsquo;ll get an email with a link to sign in. You can change their role any time.
            </p>
          </div>
          <button className="ov-close" aria-label="Close"><Icon name="x" size={16} /></button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label className="field-label">Name <span className="req">*</span></label>
              <input className="field-input" defaultValue="Ravi Kapoor" />
            </div>
            <div className="field">
              <label className="field-label">Work email <span className="req">*</span></label>
              <input className="field-input" defaultValue="ravi@dealflow.in" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div className="field">
              <label className="field-label">Role</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { id: 'admin', label: 'Admin', on: false },
                  { id: 'manager', label: 'Manager', on: true },
                  { id: 'assistant', label: 'Assistant', on: false },
                ].map(r => (
                  <div key={r.id} style={{
                    padding: '7px 14px',
                    borderRadius: 8,
                    border: '1px solid ' + (r.on ? 'var(--teal-500)' : 'var(--cream-400)'),
                    background: r.on ? 'var(--teal-50)' : '#fff',
                    color: r.on ? 'var(--teal-700)' : 'var(--cream-800)',
                    fontSize: 12.5, fontWeight: 500,
                    cursor: 'pointer',
                  }}>{r.label}</div>
                ))}
              </div>
              <div className="field-hint">Managers can publish catalogs and pricelists. Assistants are read‑only.</div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">
            <Icon name="mail" size={14} />
            Send invite
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   2 · DISCARD CHANGES  (dirty close)
   ─────────────────────────────────────────────────────────── */
function ModalDiscardChanges() {
  return (
    <div className="ab">
      <FakeCockpit section="Brands" dimmed />
      {/* Imagined slide-over peeking behind, suggests the user just hit Cancel */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 540, background: '#fff',
        borderLeft: '1px solid var(--cream-300)',
        boxShadow: '-20px 0 50px rgba(20, 40, 35, 0.10)',
        filter: 'blur(1px) brightness(0.97)',
      }}></div>
      <div className="ab-scrim"></div>

      <div className="modal modal--narrow">
        <div className="modal-head modal-head--icon">
          <div className="modal-icon modal-icon--warning">
            <Icon name="alertTriangle" size={18} stroke={1.6} />
          </div>
          <div className="title-block">
            <h2 className="ov-title" style={{ fontSize: 19 }}>Discard your changes?</h2>
            <p className="ov-sub" style={{ marginTop: 6 }}>
              You&rsquo;ve started filling in <strong style={{ color: 'var(--cream-900)' }}>Add a brand</strong>.
              Closing now means you lose what you typed — including the principal contact and GSTIN.
            </p>
          </div>
        </div>

        <div className="modal-foot" style={{ paddingTop: 18 }}>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Keep editing</button>
          <button className="btn btn-secondary" style={{ color: 'var(--danger-700)', borderColor: 'var(--cream-400)' }}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   3 · ARCHIVE PRICELIST  (simple destructive confirm)
   ─────────────────────────────────────────────────────────── */
function ModalArchivePricelist() {
  return (
    <div className="ab">
      <FakeCockpit section="Brands" dimmed />
      <div className="ab-scrim"></div>

      <div className="modal">
        <div className="modal-head modal-head--icon">
          <div className="modal-icon modal-icon--warning">
            <Icon name="archive" size={18} stroke={1.6} />
          </div>
          <div className="title-block">
            <h2 className="ov-title" style={{ fontSize: 19 }}>Archive this pricelist?</h2>
            <p className="ov-sub" style={{ marginTop: 6 }}>
              <strong style={{ color: 'var(--cream-900)' }}>North Delhi A‑class · Summer ’26</strong> will stop
              applying to new orders. Orders placed under it keep their prices.
            </p>
          </div>
        </div>

        <div className="modal-body" style={{ paddingTop: 6 }}>
          <div className="confirm-list">
            <div className="row"><span className="dot"></span><span>12 buyers will fall back to <strong style={{ color: 'var(--cream-900)' }}>Base pricelist</strong> on their next order.</span></div>
            <div className="row"><span className="dot"></span><span>4 catalogs reference this pricelist — you&rsquo;ll be asked to re‑point them.</span></div>
            <div className="row"><span className="dot"></span><span>You can restore it from <em>Archived</em> any time.</span></div>
          </div>
        </div>

        <div className="modal-foot">
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-secondary" style={{ color: 'var(--danger-700)', borderColor: 'var(--cream-400)' }}>
            <Icon name="archive" size={14} />
            Archive pricelist
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   4 · DELETE BRAND  (typed-confirm, irreversible)
   ─────────────────────────────────────────────────────────── */
function ModalDeleteBrand() {
  return (
    <div className="ab">
      <FakeCockpit section="Brands" dimmed />
      <div className="ab-scrim"></div>

      <div className="modal modal--wide">
        <div className="modal-head modal-head--icon">
          <div className="modal-icon modal-icon--danger">
            <Icon name="trash" size={18} stroke={1.6} />
          </div>
          <div className="title-block">
            <h2 className="ov-title" style={{ fontSize: 20 }}>Delete Vinikus Estates?</h2>
            <p className="ov-sub" style={{ marginTop: 6 }}>
              This removes the brand, its 82 SKUs, and 6 months of order history from your tenant.
              Buyers who recently ordered will see a &ldquo;catalog updated&rdquo; notice.
              <strong style={{ color: 'var(--danger-700)' }}> This cannot be undone.</strong>
            </p>
          </div>
        </div>

        <div className="modal-body" style={{ paddingTop: 6 }}>
          <div className="confirm-list">
            <div className="row"><span className="dot"></span><span>82 SKUs · ₹47.3 L lifetime GMV</span></div>
            <div className="row"><span className="dot"></span><span>3 active catalogs will be archived</span></div>
            <div className="row"><span className="dot"></span><span>Tally export keeps historical line items, but new exports will skip this brand</span></div>
          </div>

          <div className="typed-input" style={{ marginTop: 14 }}>
            <div className="hint">
              Type <code>Vinikus Estates</code> to confirm.
            </div>
            <input className="field-input" placeholder="Vinikus Estates" style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
        </div>

        <div className="modal-foot">
          <div style={{ fontSize: 12, color: 'var(--cream-700)' }}>
            Deleted by Phani Raju · permanent in 14 days
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-disabled" disabled>
            <Icon name="trash" size={14} />
            Delete brand
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ModalInviteMember, ModalDiscardChanges, ModalArchivePricelist, ModalDeleteBrand });
