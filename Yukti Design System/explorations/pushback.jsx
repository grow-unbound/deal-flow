// §15.5 — Where the brief fights good design (push-back, with resolutions)
const PB = { ink: '#1c1b18', sub: '#66645e', line: '#e6e3db', accent: '#8a5300' };

function Flag({ n, title, fight, fix }) {
  return (
    <div style={{ border: '1px solid ' + PB.line, borderRadius: 6, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 7, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#b0a995' }}>{String(n).padStart(2, '0')}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: PB.ink }}>{title}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: PB.sub }}>{fight}</p>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: PB.ink }}><strong style={{ color: PB.accent }}>Resolution → </strong>{fix}</p>
    </div>
  );
}

function PushbackBoard() {
  return (
    <BoardPad>
      <BoardHead kicker="§15.5 · Push-back" title="Where the brief fights good design"
        note="Per your instruction: a starting point, not a cage. Six tensions, each with the resolution already applied in these boards." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Flag n={1} title="“Energy through color” vs. WCAG AA"
          fight="Almost every hue saturated enough to read as momentum fails 4.5:1 as text. A single hero color cannot be both the energy and the ink."
          fix="Every territory ships the hero as a pair — a graphic tone (large marks, fills, the lit channel) and a text-safe tone. The badges on each color board are computed live, not claimed." />
        <Flag n={2} title="Growth-green vs. the status system"
          fight="Green is the most natural growth color (Territory A) — but green is also the universal “on track / done” semantic. If the brand is green, status risks dissolving into brand."
          fix="Status hues are reserved and never decorative; states always carry shape + label. If Territory A is chosen, its hero green and the semantic greens are deliberately distant in lightness — or pick B/C, which dodge the collision entirely." />
        <Flag n={3} title="“Symbolize momentum” + the banned-cliché list"
          fight="Arrows, swooshes, rising charts and connected dots are both the banned list and the entire visual vocabulary of momentum. Asked literally, the brief forbids its own subject."
          fix="Momentum is encoded structurally, not pictorially: a junction resolved (A), a baseline stepped up (B), a path cut through mass (C). No arrowheads anywhere." />
        <Flag n={4} title="Multi-script day one vs. display typography"
          fight="Almost no characterful display face has Devanagari and Arabic siblings of equal quality. Demanding one font with personality across three scripts guarantees a compromise somewhere."
          fix="Superfamily strategy: Plex (A), Anek + Cairo (B), Archivo + Noto trio (C). Latin-only display flex is permitted in marketing, never in product — the UI is script-equal everywhere." />
        <Flag n={5} title="“Like Ramp/Monzo, unlike any fintech”"
          fight="Ramp and Monzo define the current fintech look — citing them as the energy anchor while banning anything fintech-shaped is self-contradictory if taken visually."
          fix="Borrow their discipline, not their dress: one hero color, type-led layout, a single loud element per view. None of the three palettes or marks resembles either brand." />
        <Flag n={6} title="Devanagari as “confident nod, never decoration”"
          fight="Taste is not a guardrail. Without a rule, युक्ति will drift into pattern fills and festival posts — exactly the ethnic-decoration failure the brief fears."
          fix="A hard rule: Devanagari appears only as the complete secondary lockup, or as live copy in Hindi-language contexts. Never cropped, tilted, or used as texture." />
      </div>
    </BoardPad>
  );
}

// ── Intro board: the thesis, distilled to what the identity must do ──────
function IntroBoard() {
  const item = (k, v) => (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12, fontSize: 12.5, lineHeight: 1.5 }}>
      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, color: '#a09a8e', textTransform: 'uppercase', letterSpacing: '.08em', paddingTop: 2 }}>{k}</span>
      <span style={{ color: '#44423d' }}>{v}</span>
    </div>
  );
  return (
    <BoardPad>
      <BoardHead kicker="Yukti · identity territories v1" title="The brief, held to" />
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: '#1c1b18', maxWidth: 560 }}>
        <em>“Your unfair advantage to grow and win.”</em> Each territory must look like <strong>the winning move — judgment in motion</strong> — and unlike every other B2B mark. Bold about the owner's growth; exact about money.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, borderTop: '1px solid #e6e3db', paddingTop: 14 }}>
        {item('A · Fork', 'Many paths resolve into one decisive line — the Y itself is the move. Hottest tie to the name.')}
        {item('B · Step', 'Growth as a level gained and held — the warmest, most operator-rooted of the three.')}
        {item('C · Path', 'The operational weight with a way cut through — the most abstract, most global-tech.')}
        {item('Fixed core', 'The clarity-of-status grammar (§11) is identical across all three; only the chrome and the single next-action take the hero color.')}
      </div>
      <div style={{ background: '#1c1b18', color: '#f5f4ef', borderRadius: 6, padding: '13px 16px', fontSize: 12.5, lineHeight: 1.5 }}>
        The decision test, applied to identity: <strong>does it make the owner look powerful — with them in control?</strong> Every board below was checked against it.
      </div>
    </BoardPad>
  );
}

Object.assign(window, { PushbackBoard, IntroBoard });
