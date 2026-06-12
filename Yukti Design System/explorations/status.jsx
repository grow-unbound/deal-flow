// §11 — The clarity-of-status grammar, shown in real product context.
// Core-neutral skin: the grammar is FIXED brand core; the territory hero color
// skins chrome and the single next-action, never the statuses themselves.
const ST = {
  ink: '#1A1B18', paper: '#F7F6F2', sub: '#6B6A64', line: '#E5E3DC', card: '#FFFFFF',
  attn: '#8A5300', attnBg: '#FAEFD7', attnIcon: '#C27A00',
  track: '#1E6E47', trackBg: '#EAF3EC',
  done: '#14532D', doneBg: '#E2EEE4',
  font: '"IBM Plex Sans", sans-serif',
};

// One shape per state — status is never color alone.
function StIcon({ kind, size = 14 }) {
  if (kind === 'attn') return ( // filled diamond — interrupts the eye
    <svg width={size} height={size} viewBox="0 0 16 16"><path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" fill={ST.attnIcon}></path></svg>
  );
  if (kind === 'track') return ( // open ring — in motion, nothing owed
    <svg width={size} height={size} viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.4" fill="none" stroke={ST.track} strokeWidth="2.4"></circle></svg>
  );
  return ( // filled circle + check — settled
    <svg width={size} height={size} viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill={ST.done}></circle><path d="M5 8.2 L7.2 10.4 L11.2 6" stroke="#fff" strokeWidth="1.8" fill="none"></path></svg>
  );
}
function StChip({ kind, children }) {
  const m = { attn: [ST.attn, ST.attnBg], track: [ST.track, ST.trackBg], done: [ST.done, ST.doneBg] }[kind];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: m[1], color: m[0], borderRadius: 4, padding: '4px 9px', fontSize: 12, fontWeight: 600, fontFamily: ST.font, whiteSpace: 'nowrap' }}>
      <StIcon kind={kind} size={12} />{children}
    </span>
  );
}
function NextAction({ children, wide, hero }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', cursor: 'pointer',
      background: hero || ST.ink, color: '#fff', fontFamily: ST.font, fontWeight: 600, fontSize: 14,
      borderRadius: 6, padding: '0 18px', height: 46, width: wide ? '100%' : 'auto', whiteSpace: 'nowrap'
    }}>{children}<span aria-hidden="true">→</span></button>
  );
}

// ── Board 1: the grammar itself ─────────────────────────────────────────
function GrammarRow({ kind, name, when, pair }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '30px 150px 1fr 180px', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + ST.line }}>
      <StIcon kind={kind} size={18} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: ST.ink }}>{name}</span>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#999' }}>{pair}</span>
      </div>
      <span style={{ fontSize: 12, color: ST.sub, lineHeight: 1.45 }}>{when}</span>
      <StChip kind={kind}>{kind === 'attn' ? '3 prices need review' : kind === 'track' ? 'On the way' : 'Delivered'}</StChip>
    </div>
  );
}
function StBoardGrammar() {
  const rules = [
    ['Never color alone', 'Every state carries a shape and a label. A color-blind operator reads the diamond/ring/check before any hue.'],
    ['One loud element per view', 'Exactly one "do this next" affordance — it alone takes the territory hero color. Statuses never do.'],
    ['Attention sorts up, done settles down', 'Needs-attention always rises to the top of any list or tile; done collapses to a count.'],
    ['Reserved hues', 'Amber and the two greens are semantic-only — never decoration, never brand. The hero is never a status.'],
    ['RTL-ready', 'The next-action arrow and any directional icon mirror in Arabic layouts; shapes are symmetric by design.'],
  ];
  return (
    <BoardPad>
      <BoardHead kicker="§11 · Clarity of status — fixed brand core" title="Diamond asks. Ring moves. Check settles."
        note='The promise is "always know what matters and what to do next" — so status gets one grammar, as protected as the logo. Three states, three shapes, one next-action.' />
      <div>
        <GrammarRow kind="attn" name="Needs attention" pair="#8A5300 on #FAEFD7" when="Something is owed a decision. The only state allowed to interrupt; capped per view so it stays meaningful." />
        <GrammarRow kind="track" name="On track" pair="#1E6E47 on #EAF3EC" when="Moving as expected — visible, quiet, never animated. Nothing is owed." />
        <GrammarRow kind="done" name="Done" pair="#14532D on #E2EEE4" when="Settled and verifiable. Done is exact — it appears only when the books agree." />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 0 2px' }}>
        <NextAction>Review 3 prices</NextAction>
        <span style={{ fontSize: 12, color: ST.sub, lineHeight: 1.45, maxWidth: 380 }}>The single <strong>do-this-next</strong> affordance — Yukti recommends, the owner decides. It proposes; it never auto-applies.</span>
      </div>
      <div style={{ borderTop: '1px solid ' + ST.line, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rules.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 12, fontSize: 12, lineHeight: 1.45 }}>
            <span style={{ fontWeight: 600, color: ST.ink }}>{r[0]}</span>
            <span style={{ color: ST.sub }}>{r[1]}</span>
          </div>
        ))}
      </div>
    </BoardPad>
  );
}

// ── Board 2: distributor dashboard tile ─────────────────────────────────
function StBoardTile() {
  const row = (kind, label, val) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid ' + ST.line }}>
      <StIcon kind={kind} size={15} />
      <span style={{ fontSize: 13.5, color: ST.ink, flex: 1 }}>{label}</span>
      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12.5, color: ST.sub, whiteSpace: 'nowrap' }}>{val}</span>
    </div>
  );
  return (
    <div style={{ background: ST.paper, height: '100%', boxSizing: 'border-box', padding: 24, fontFamily: ST.font, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12, color: ST.sub }}>Tuesday 10 June · Lakshmi Agencies, Hyderabad</span>
        <span style={{ fontSize: 18, fontWeight: 600, color: ST.ink }}>Here's what needs your attention today.</span>
      </div>
      <div style={{ background: ST.card, border: '1px solid ' + ST.line, borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: ST.ink }}>Pricing</span>
          <span style={{ fontSize: 11.5, color: ST.sub }}>updated 6:02 pm</span>
        </div>
        {row('attn', '3 prices below floor margin', '₹42,300 at stake')}
        {row('track', '18 SKUs repricing on schedule', 'next run 7 pm')}
        {row('done', '42 prices updated and posted', 'books agree')}
        <div style={{ paddingTop: 14 }}>
          <NextAction>Review 3 prices</NextAction>
        </div>
      </div>
      <span style={{ fontSize: 11.5, color: ST.sub, lineHeight: 1.5 }}>One tile, one ask. Money is exact to the rupee; the bold register is reserved for the action, not the numbers.</span>
    </div>
  );
}

// ── Board 3: buyer PWA — orders ──────────────────────────────────────────
function StBoardPwa() {
  const order = (kind, chip, name, meta) => (
    <div style={{ background: ST.card, border: '1px solid ' + ST.line, borderRadius: 8, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 44, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: ST.ink }}>{name}</span>
        <StChip kind={kind}>{chip}</StChip>
      </div>
      <span style={{ fontSize: 12, color: ST.sub }}>{meta}</span>
    </div>
  );
  return (
    <div style={{ background: ST.paper, height: '100%', boxSizing: 'border-box', fontFamily: ST.font, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '18px 16px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12, color: ST.sub }}>Sharma Traders · buyer app</span>
        <span style={{ fontSize: 20, fontWeight: 600, color: ST.ink }}>Orders</span>
      </div>
      <div style={{ padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {order('attn', 'Confirm 2 substitutions', 'Order #4811 · 36 items', 'Two SKUs out of stock — swaps proposed at the same price.')}
        {order('track', 'On the way', 'Order #4807 · 18 items', 'Out for delivery · arriving today by 5 pm')}
        {order('track', 'Packing', 'Order #4804 · 52 items', 'Picked 40 of 52 · on schedule')}
        {order('done', 'Delivered', 'Order #4799 · 24 items', 'Delivered Mon · invoice ₹18,640 · books updated')}
      </div>
      <div style={{ padding: '10px 16px 16px', borderTop: '1px solid ' + ST.line, background: ST.paper }}>
        <NextAction wide>Confirm 2 substitutions</NextAction>
        <span style={{ display: 'block', textAlign: 'center', fontSize: 10.5, color: ST.sub, paddingTop: 8 }}>52 px action bar · all touch targets ≥ 44 px</span>
      </div>
    </div>
  );
}

Object.assign(window, { StBoardGrammar, StBoardTile, StBoardPwa, StChip, StIcon, NextAction });
