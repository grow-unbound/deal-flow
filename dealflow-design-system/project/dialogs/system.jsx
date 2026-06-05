// dialogs/system.jsx — System rules + decision matrix.
// One large artboard that documents the WHEN of the system,
// so the three example tiers below have a clear authority.

function SystemRulesCard() {
  return (
    <div className="docs-shell">
      <div className="docs-head">
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--cream-700)', marginBottom: 8,
        }}>Dialogs &amp; overlays · System</div>
        <h1>Three tiers. Decide by data‑context, not field count.</h1>
        <p className="sub">
          Modals confirm or capture a tiny payload. Slide‑overs hold the full
          form for one entity. Composers take over the page when the work needs
          you to <em>see</em> other data (filter a population, edit values per row,
          review before committing). The deciding question is never &ldquo;how many
          fields&rdquo; — it&rsquo;s &ldquo;does the user need to look at other data to fill this in?&rdquo;
        </p>
      </div>

      <div className="tier-grid">
        {/* Tier 1 — Modal */}
        <div className="tier-card">
          <div className="tag">Tier 1</div>
          <div className="name">Modal</div>
          <div className="desc">
            Centered, blocking, ≤ 30 seconds of work. Confirmations,
            destructive actions, and invites with three or fewer fields.
            Closes on Escape and on backdrop click — never use one to hold work
            a user could lose.
          </div>
          <div className="uses">
            <ul>
              <li>Invite a tenant team member (name, email, role)</li>
              <li>Archive / delete confirmations</li>
              <li>Typed‑confirm for irreversible actions</li>
              <li>&ldquo;Discard changes?&rdquo; warnings on dirty close</li>
            </ul>
          </div>
          <div className="specs">
            <div className="row"><span className="l">Width</span><span className="v">408 / 460 / 540 px</span></div>
            <div className="row"><span className="l">Radius</span><span className="v">20 px</span></div>
            <div className="row"><span className="l">Scrim</span><span className="v">cream‑900 @ 42%, 2px blur</span></div>
            <div className="row"><span className="l">Dismiss</span><span className="v">Esc · scrim · close X</span></div>
            <div className="row"><span className="l">Route</span><span className="v">None — query param only</span></div>
          </div>
        </div>

        {/* Tier 2 — Slide-over */}
        <div className="tier-card">
          <div className="tag">Tier 2</div>
          <div className="name">Slide‑over panel</div>
          <div className="desc">
            Right‑edge drawer for <em>creating</em> a single entity. Holds the
            full form (identity, contacts, commercials, internal notes) without
            taking the user off the list they came from. Edit lives on the
            Detail page — never re‑uses this surface.
          </div>
          <div className="uses">
            <ul>
              <li>Add a brand (with master search inline)</li>
              <li>Add a product (with master search inline)</li>
              <li>Add a customer (buyer)</li>
              <li>Pickers nested inside (stack one panel over another)</li>
            </ul>
          </div>
          <div className="specs">
            <div className="row"><span className="l">Width</span><span className="v">540 px (640 if wide form)</span></div>
            <div className="row"><span className="l">Radius</span><span className="v">0 (flush right edge)</span></div>
            <div className="row"><span className="l">Scrim</span><span className="v">cream‑900 @ 24% under panel</span></div>
            <div className="row"><span className="l">Dismiss</span><span className="v">Esc · scrim · close → &ldquo;Discard?&rdquo;</span></div>
            <div className="row"><span className="l">Route</span><span className="v">/brands?new=true</span></div>
          </div>
        </div>

        {/* Tier 3 — Composer */}
        <div className="tier-card">
          <div className="tag">Tier 3</div>
          <div className="name">Composer (full page)</div>
          <div className="desc">
            A dedicated route that takes over the content area when the user
            must filter a population, edit values per row, and review before
            committing. Three‑column rhythm: filters · data · summary. Auto‑saves
            to draft every few seconds — the back button works.
          </div>
          <div className="uses">
            <ul>
              <li>Add a pricelist (filter SKUs, edit prices, review)</li>
              <li>Add a catalog (filter products, set order, review)</li>
              <li>Add a cohort (filter buyers, review membership)</li>
              <li>Any &ldquo;publish&rdquo; flow that needs side‑by‑side data</li>
            </ul>
          </div>
          <div className="specs">
            <div className="row"><span className="l">Width</span><span className="v">Full content area (≥ 1100 px)</span></div>
            <div className="row"><span className="l">Layout</span><span className="v">260 · flex · 320</span></div>
            <div className="row"><span className="l">Header</span><span className="v">Breadcrumb · title · stepper</span></div>
            <div className="row"><span className="l">Dismiss</span><span className="v">Back button — draft persists</span></div>
            <div className="row"><span className="l">Route</span><span className="v">/pricelists/new</span></div>
          </div>
        </div>
      </div>

      {/* Decision matrix */}
      <div className="matrix">
        <table>
          <thead>
            <tr>
              <th style={{ width: '38%' }}>If the user…</th>
              <th>…use this tier</th>
              <th>Because</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="q">Confirms or rejects something they&rsquo;ve already triggered</td>
              <td className="a"><span className="verdict verdict-modal">Modal</span></td>
              <td className="a">Decision, not work. Esc and scrim are safe to use.</td>
            </tr>
            <tr>
              <td className="q">Enters ≤ 3 fields with no need to look at other data</td>
              <td className="a"><span className="verdict verdict-modal">Modal</span></td>
              <td className="a">Invite, rename, schedule — keep the surrounding page visible.</td>
            </tr>
            <tr>
              <td className="q">Performs an irreversible action that could affect live orders</td>
              <td className="a"><span className="verdict verdict-modal">Modal</span> <span style={{ color: 'var(--cream-700)', fontSize: 12, marginLeft: 4 }}>(typed‑confirm)</span></td>
              <td className="a">Force a deliberate pause. Type the name to enable Delete.</td>
            </tr>
            <tr>
              <td className="q">Creates one new entity (brand, product, customer)</td>
              <td className="a"><span className="verdict verdict-slide">Slide‑over</span></td>
              <td className="a">Full form, no context loss from the list they came from.</td>
            </tr>
            <tr>
              <td className="q">Needs to pick from a long list mid‑form (cohort, master brand)</td>
              <td className="a"><span className="verdict verdict-slide">Slide‑over</span> <span style={{ color: 'var(--cream-700)', fontSize: 12, marginLeft: 4 }}>(stacked)</span></td>
              <td className="a">Push a second panel; back arrow returns. No third level.</td>
            </tr>
            <tr>
              <td className="q">Edits an existing entity</td>
              <td className="a"><span className="verdict verdict-skip">Detail page</span></td>
              <td className="a">Edits stay on the Detail page. Slide‑over is create‑only.</td>
            </tr>
            <tr>
              <td className="q">Filters a population and decides something per row</td>
              <td className="a"><span className="verdict verdict-comp">Composer</span></td>
              <td className="a">Needs filters · data · summary side by side. Drafts persist.</td>
            </tr>
            <tr>
              <td className="q">Adds a buyer‑side team member to a customer record</td>
              <td className="a"><span className="verdict verdict-skip">Inline row</span></td>
              <td className="a">Name + phone + role lives in the Customer&rsquo;s Team tab as an inline row.</td>
            </tr>
            <tr>
              <td className="q">Closes a form with unsaved changes</td>
              <td className="a"><span className="verdict verdict-modal">Modal</span></td>
              <td className="a">Always confirm &ldquo;Discard changes?&rdquo; — Phani lost work once and we don&rsquo;t do that.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { SystemRulesCard });
