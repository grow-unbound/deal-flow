// dialogs/slideovers.jsx — 4 slide-over examples:
//   1. Add a brand — search-as-you-type with master suggestions (no upfront fork)
//   2. Add a brand — after master selected (imported state)
//   3. Add a customer — full form, no master concept
//   4. Add a brand — STACKED inner picker for default cohort

/* ───────────────────────────────────────────────────────────
   1 · ADD A BRAND — empty / typing state with master matches
   ─────────────────────────────────────────────────────────── */
function SOAddBrandSearch() {
  return (
    <div className="ab">
      <FakeCockpit section="Brands" dimmed />
      <div className="ab-scrim" style={{ background: 'rgba(26,26,26,0.24)' }}></div>

      <div className="slideover">
        <div className="slideover-head">
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>Brands</div>
            <h2 className="ov-title">Add a brand</h2>
            <div className="slideover-head-meta">
              <span>Start with the name. We&rsquo;ll match it against the master directory.</span>
            </div>
          </div>
          <button className="ov-close" aria-label="Close"><Icon name="x" size={16} /></button>
        </div>

        <div className="slideover-body">
          <div className="so-section">
            <div className="so-section-head">
              <div className="so-section-title">Brand name</div>
              <div className="so-section-sub">Required</div>
            </div>

            <div className="combo">
              <div className="combo-input combo-input--focus">
                <Icon name="search" size={14} color="var(--cream-700)" />
                <input defaultValue="Vinik" autoFocus />
                <span style={{ fontSize: 11, color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>3 matches</span>
              </div>

              <div className="combo-pop">
                <div className="combo-pop-section">
                  <div className="combo-pop-eyebrow">Master directory · import &amp; prefill</div>

                  <div className="combo-item combo-item--hl">
                    <div className="b-av b-av--teal">VE</div>
                    <div className="combo-item-meta">
                      <div className="combo-item-name">Vinikus Estates</div>
                      <div className="combo-item-sub">Wine · Maharashtra · 82 SKUs · GSTIN 27AABC…</div>
                    </div>
                    <span className="combo-item-badge">Verified</span>
                  </div>

                  <div className="combo-item">
                    <div className="b-av b-av--cream">VC</div>
                    <div className="combo-item-meta">
                      <div className="combo-item-name">Vinika Coffee Roasters</div>
                      <div className="combo-item-sub">Coffee · Karnataka · 24 SKUs</div>
                    </div>
                    <span className="combo-item-badge">Verified</span>
                  </div>

                  <div className="combo-item">
                    <div className="b-av b-av--ember">VK</div>
                    <div className="combo-item-meta">
                      <div className="combo-item-name">Vinikalp Spirits</div>
                      <div className="combo-item-sub">Spirits · Goa · 47 SKUs</div>
                    </div>
                    <span className="combo-item-badge">Verified</span>
                  </div>
                </div>

                <div className="combo-create">
                  <Icon name="plus" size={13} color="var(--cream-700)" />
                  <span>Keep typing to create custom brand <strong>&ldquo;Vinik&rdquo;</strong> · press</span>
                  <kbd>Enter</kbd>
                </div>
              </div>
            </div>

            <div className="field-hint" style={{ marginTop: 6 }}>
              Picking a master brand pre‑fills the principal, GSTIN, and category fields.
              Custom brands stay private to your tenant.
            </div>
          </div>
        </div>

        <div className="slideover-foot">
          <span className="status">
            <Icon name="info" size={13} color="var(--cream-600)" />
            Step 1 — basics
          </span>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-disabled" disabled>Continue</button>
        </div>
      </div>
    </div>);

}

/* ───────────────────────────────────────────────────────────
   2 · ADD A BRAND — master selected, form filled out
   ─────────────────────────────────────────────────────────── */
function SOAddBrandFilled() {
  return (
    <div className="ab">
      <FakeCockpit section="Brands" dimmed />
      <div className="ab-scrim" style={{ background: 'rgba(26,26,26,0.24)' }}></div>

      <div className="slideover">
        <div className="slideover-head">
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>Brands</div>
            <h2 className="ov-title">Add a brand</h2>
            <div className="slideover-head-meta">
              <span>Imported from master · adjust anything before saving.</span>
            </div>
          </div>
          <button className="ov-close" aria-label="Close"><Icon name="x" size={16} /></button>
        </div>

        <div className="slideover-body">
          {/* Imported banner */}
          <div className="imported-banner">
            <div className="ib-icon"><Icon name="check" size={16} stroke={1.75} /></div>
            <div className="ib-meta">
              <div className="ib-name">Imported from master · Vinikus Estates</div>
              <div className="ib-sub">82 SKUs available · last verified 12 days ago</div>
            </div>
            <button className="ib-clear">Clear</button>
          </div>

          {/* Identity */}
          <div className="so-section">
            <div className="so-section-title">Identity</div>
            <div className="field-grid">
              <div className="field field-full">
                <label className="field-label">Brand name <span className="req">*</span></label>
                <input className="field-input" defaultValue="Vinikus Estates" />
              </div>
              <div className="field">
                <label className="field-label">Category</label>
                <select className="field-select" defaultValue="Wine">
                  <option>Wine</option><option>Spirits</option><option>Beer</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Region</label>
                <input className="field-input" defaultValue="Nashik, MH" />
              </div>
            </div>
          </div>

          {/* Principal contact */}
          <div className="so-section">
            <div className="so-section-title">Principal contact</div>
            <div className="field-grid">
              <div className="field">
                <label className="field-label">Name</label>
                <input className="field-input" defaultValue="Anand Mehrotra" />
              </div>
              <div className="field">
                <label className="field-label">Phone</label>
                <input className="field-input" defaultValue="+91 98203 11842" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
            </div>
          </div>

          {/* Defaults — has picker fields */}
          <div className="so-section">
            <div className="so-section-title">Defaults</div>
            <div className="field-grid">
              <div className="field field-full">
                <label className="field-label">Default cohort</label>
                <div className="combo-input" style={{ justifyContent: 'space-between' }} data-comment-anchor="64a7b35ba8-div-177-17">
                  <span style={{ color: 'var(--cream-600)' }}>Pick a cohort</span>
                  <Icon name="chevronRight" size={14} color="var(--cream-700)" />
                </div>
                <div className="field-hint">Opens a picker — keep typing or browse.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="slideover-foot">
          <span className="status">
            <Icon name="check" size={13} color="var(--success-500)" />
            Draft saved · 2 sec ago
          </span>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">
            Save brand
            <Icon name="check" size={14} stroke={1.75} />
          </button>
        </div>
      </div>
    </div>);

}

/* ───────────────────────────────────────────────────────────
   3 · ADD A CUSTOMER — long-form, no master concept
   ─────────────────────────────────────────────────────────── */
function SOAddCustomer() {
  return (
    <div className="ab">
      <FakeCockpit section="Customers" dimmed />
      <div className="ab-scrim" style={{ background: 'rgba(26,26,26,0.24)' }}></div>

      <div className="slideover" style={{ width: 540 }}>
        <div className="slideover-head">
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>Customers</div>
            <h2 className="ov-title">Add a buyer</h2>
            <div className="slideover-head-meta">
              <span>You can add team members and shipping addresses after the buyer is created.</span>
            </div>
          </div>
          <button className="ov-close" aria-label="Close"><Icon name="x" size={16} /></button>
        </div>

        <div className="slideover-body">
          <div className="so-section">
            <div className="so-section-title">Identity</div>
            <div className="field-grid">
              <div className="field field-full">
                <label className="field-label">Business name <span className="req">*</span></label>
                <input className="field-input" defaultValue="Bharat Stores" />
              </div>
              <div className="field">
                <label className="field-label">City</label>
                <input className="field-input" defaultValue="Karol Bagh, Delhi" />
              </div>
              <div className="field">
                <label className="field-label">Tier</label>
                <select className="field-select" defaultValue="A">
                  <option value="A">Tier A</option>
                  <option value="B">Tier B</option>
                  <option value="C">Tier C</option>
                </select>
              </div>
            </div>
          </div>

          <div className="so-section">
            <div className="so-section-title">Primary contact</div>
            <div className="field-grid">
              <div className="field">
                <label className="field-label">Name</label>
                <input className="field-input" defaultValue="Suresh Bharat" />
              </div>
              <div className="field">
                <label className="field-label">Role</label>
                <input className="field-input" defaultValue="Proprietor" />
              </div>
              <div className="field">
                <label className="field-label">Phone <span className="req">*</span></label>
                <input className="field-input" defaultValue="+91 98101 22433" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div className="field">
                <label className="field-label">Email</label>
                <input className="field-input" placeholder="optional" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
            </div>
          </div>

          <div className="so-section">
            <div className="so-section-title">Tax &amp; terms</div>
            <div className="field-grid">
              <div className="field">
                <label className="field-label">GSTIN</label>
                <input className="field-input" defaultValue="07AABCV1234L1Z5" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div className="field">
                <label className="field-label">Payment terms</label>
                <select className="field-select" defaultValue="Net 21">
                  <option>Cash on delivery</option>
                  <option>Net 14</option>
                  <option>Net 21</option>
                  <option>Net 30</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Credit limit (₹)</label>
                <input className="field-input" defaultValue="2,50,000" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div className="field">
                <label className="field-label">Default cohort</label>
                <div className="combo-input" style={{ justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--cream-600)' }}>Pick a cohort</span>
                  <Icon name="chevronRight" size={14} color="var(--cream-700)" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="slideover-foot">
          <span className="status">
            <Icon name="check" size={13} color="var(--success-500)" />
            Draft saved · 4 sec ago
          </span>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">Save buyer</button>
        </div>
      </div>
    </div>);

}

/* ───────────────────────────────────────────────────────────
   4 · STACKED PICKER — Default cohort, opened from Add a brand
   ─────────────────────────────────────────────────────────── */
function SOStackedPicker() {
  return (
    <div className="ab">
      <FakeCockpit section="Brands" dimmed />
      <div className="ab-scrim" style={{ background: 'rgba(26,26,26,0.30)' }}></div>

      {/* The underlying slide-over, partially visible */}
      <div className="slideover-under" style={{ width: 540 }}>
        <div className="slideover-head" style={{ opacity: 0.45 }}>
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>Brands</div>
            <h2 className="ov-title">Add a brand</h2>
          </div>
        </div>
      </div>

      {/* The pushed-over second panel */}
      <div className="slideover-stack" style={{ width: 540 }}>
        <div className="slideover-head">
          <div className="title-block">
            <button className="back-link">
              <Icon name="chevronLeft" size={13} />
              Back to Add a brand
            </button>
            <h2 className="ov-title" style={{ marginTop: 6 }}>Pick a default cohort</h2>
            <div className="slideover-head-meta">
              <span>The cohort that catalogs and pricelists for this brand will default to.</span>
            </div>
          </div>
          <button className="ov-close" aria-label="Close"><Icon name="x" size={16} /></button>
        </div>

        <div className="slideover-body">
          <div className="picker-search">
            <Icon name="search" size={14} color="var(--cream-700)" />
            <span style={{ flex: 1 }}>Search cohorts…</span>
            <span style={{ fontSize: 11, color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>5 cohorts</span>
          </div>

          <div className="picker-list">
            <div className="picker-row picker-row--selected">
              <div className="b-av b-av--ember">ND</div>
              <div className="picker-row-meta">
                <div className="picker-row-name">North Delhi · A‑class</div>
                <div className="picker-row-sub">12 buyers · default price list <span className="picker-row-mono">PL‑NDA‑01</span></div>
              </div>
              <Icon name="check" size={14} color="var(--ember-500)" stroke={2} />
            </div>
            <div className="picker-row">
              <div className="b-av b-av--teal">SD</div>
              <div className="picker-row-meta">
                <div className="picker-row-name">South Delhi · A‑class</div>
                <div className="picker-row-sub">9 buyers · default price list <span className="picker-row-mono">PL‑SDA‑01</span></div>
              </div>
            </div>
            <div className="picker-row">
              <div className="b-av b-av--cream">NC</div>
              <div className="picker-row-meta">
                <div className="picker-row-name">NCR · B‑class</div>
                <div className="picker-row-sub">31 buyers · default price list <span className="picker-row-mono">PL‑NCR‑02</span></div>
              </div>
            </div>
            <div className="picker-row">
              <div className="b-av b-av--teal">GZ</div>
              <div className="picker-row-meta">
                <div className="picker-row-name">Ghaziabad · all tiers</div>
                <div className="picker-row-sub">18 buyers · default price list <span className="picker-row-mono">PL‑GZB‑01</span></div>
              </div>
            </div>
            <div className="picker-row">
              <div className="b-av b-av--ember">FR</div>
              <div className="picker-row-meta">
                <div className="picker-row-name">Faridabad · pilot</div>
                <div className="picker-row-sub">4 buyers · default price list <span className="picker-row-mono">PL‑FRB‑01</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="slideover-foot">
          <span className="status">
            Selecting <strong style={{ color: 'var(--cream-900)' }}>North Delhi · A‑class</strong>
          </span>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">Use this cohort</button>
        </div>
      </div>
    </div>);

}

Object.assign(window, {
  SOAddBrandSearch, SOAddBrandFilled, SOAddCustomer, SOStackedPicker,
  SOPickerFlipUp
});

/* ───────────────────────────────────────────────────────────
   5 · PICKER FLIP-UP — field near bottom of a scrolled slide-over.
   Demonstrates how an inline combobox picker behaves when there
   isn't room below the anchor. Two rules:
     (a) Popover anchors below by default, flips ABOVE the field
         when there's < 280px between the field and the panel foot.
     (b) The popover itself never scrolls past 220px tall — if the
         match set is longer, promote to the stacked picker
         (Tier 2 · sibling pattern shown in artboard 4).
   ─────────────────────────────────────────────────────────── */
function SOPickerFlipUp() {
  return (
    <div className="ab">
      <FakeCockpit section="Customers" dimmed />
      <div className="ab-scrim" style={{ background: 'rgba(26,26,26,0.24)' }}></div>

      <div className="slideover" style={{ width: 540 }}>
        <div className="slideover-head">
          <div className="title-block">
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>Customers</div>
            <h2 className="ov-title">Add a buyer</h2>
            <div className="slideover-head-meta">
              <span>Scrolled past Identity &amp; Primary contact — picker opens upward.</span>
            </div>
          </div>
          <button className="ov-close" aria-label="Close"><Icon name="x" size={16} /></button>
        </div>

        <div className="slideover-body-scroll">
          {/* top fade — indicates content has scrolled above */}
          <div className="slideover-body-scroll-fade-top"></div>
          {/* fake scrollbar */}
          <div className="slideover-scrollbar">
            <div className="thumb" style={{ top: '58%', height: '32%' }}></div>
          </div>

          {/* The scrolled content. We render the BOTTOM of the form so the
              picker field sits near the slide-over foot, demonstrating
              the flip-up rule. */}
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Partial slice of the previous section, half-cut to suggest scroll */}
            <div style={{ opacity: 0.55, marginTop: -40 }}>
              <div className="so-section">
                <div className="so-section-title">Tax &amp; terms</div>
                <div className="field-grid">
                  <div className="field">
                    <label className="field-label">GSTIN</label>
                    <input className="field-input" defaultValue="07AABCV1234L1Z5" style={{ fontFamily: 'var(--font-mono)' }} />
                  </div>
                  <div className="field">
                    <label className="field-label">PAN</label>
                    <input className="field-input" defaultValue="AABCV1234L" style={{ fontFamily: 'var(--font-mono)' }} />
                  </div>
                  <div className="field">
                    <label className="field-label">Payment terms</label>
                    <select className="field-select" defaultValue="Net 21">
                      <option>Net 21</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">Credit limit (₹)</label>
                    <input className="field-input" defaultValue="2,50,000" style={{ fontFamily: 'var(--font-mono)' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Addresses — full section */}
            <div className="so-section">
              <div className="so-section-title">Addresses</div>
              <div className="field-grid">
                <div className="field field-full">
                  <label className="field-label">Billing address</label>
                  <textarea className="field-textarea" defaultValue="Shop 14, Bharat Market, Karol Bagh, New Delhi 110005"></textarea>
                </div>
              </div>
            </div>

            {/* Defaults — the picker field, sitting near the bottom */}
            <div className="so-section" style={{ position: 'relative' }}>
              <div className="so-section-title">Defaults</div>
              <div className="field-grid">
                <div className="field field-full">
                  <label className="field-label">Default cohort <span className="req">*</span></label>

                  <div className="combo">
                    <div className="combo-input combo-input--focus" style={{ justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cream-900)' }}>
                        <Icon name="search" size={14} color="var(--cream-700)" />
                        <span style={{ color: 'var(--cream-900)' }}>nor</span>
                        <span style={{
                          display: 'inline-block', width: 1, height: 14,
                          background: 'var(--ember-400)',
                        }}></span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>3 matches</span>
                    </div>

                    {/* Popover flips UPWARD because the field is near the bottom */}
                    <div className="combo-pop combo-pop--up">
                      <div className="combo-pop-search">
                        <Icon name="search" size={13} color="var(--cream-700)" />
                        <input defaultValue="nor" />
                        <span className="count">3 / 12</span>
                      </div>
                      <div className="combo-pop-list" style={{ maxHeight: 168 }}>
                        <div className="combo-pop-section" style={{ paddingTop: 6 }}>
                          <div className="combo-item combo-item--hl">
                            <div className="b-av b-av--ember">ND</div>
                            <div className="combo-item-meta">
                              <div className="combo-item-name">North Delhi · A‑class</div>
                              <div className="combo-item-sub">12 buyers · PL‑NDA‑01</div>
                            </div>
                            <Icon name="check" size={13} color="var(--ember-500)" stroke={2} />
                          </div>
                          <div className="combo-item">
                            <div className="b-av b-av--teal">NC</div>
                            <div className="combo-item-meta">
                              <div className="combo-item-name">NCR · B‑class</div>
                              <div className="combo-item-sub">31 buyers · PL‑NCR‑02</div>
                            </div>
                          </div>
                          <div className="combo-item">
                            <div className="b-av b-av--cream">NO</div>
                            <div className="combo-item-meta">
                              <div className="combo-item-name">Noida · pilot</div>
                              <div className="combo-item-sub">8 buyers · PL‑NOI‑01</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="combo-create" style={{ borderTop: '1px solid var(--cream-300)' }}>
                        <Icon name="chevronsRight" size={13} color="var(--cream-700)" />
                        <span>Don&rsquo;t see it? <strong>Browse all cohorts</strong> opens a stacked picker.</span>
                      </div>
                    </div>
                  </div>

                  <div className="field-hint">
                    Picker anchors above the field when there&rsquo;s less than 280px below — keeps the foot reachable.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* bottom fade — content goes under the foot */}
          <div className="slideover-body-scroll-fade-bot"></div>
        </div>

        <div className="slideover-foot">
          <span className="status">
            <Icon name="check" size={13} color="var(--success-500)" />
            Draft saved · 6 sec ago
          </span>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">Save buyer</button>
        </div>
      </div>

      {/* Annotation badge inside the artboard */}
      <div style={{
        position: 'absolute',
        left: 18, bottom: 18,
        background: 'var(--teal-50)',
        border: '1px solid var(--teal-100)',
        borderRadius: 10,
        padding: '10px 14px',
        maxWidth: 340,
        fontSize: 12.5,
        color: 'var(--teal-700)',
        lineHeight: 1.5,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <strong style={{ color: 'var(--teal-900)' }}>Rule.</strong>{' '}
        Inline popover flips up when the anchor has less than 280&nbsp;px below it.
        If matches exceed 5 rows or labels wrap, promote to a stacked picker (Tier 2, sibling artboard).
      </div>
    </div>);

}