// Territory A — "The Fork, Resolved" (rotated-Y junction)
const A = {
  ink: '#10231B',
  paper: '#F7F6F1',
  hero: '#1DB868',     // graphic momentum green
  heroText: '#0A6B43', // text-safe won green
  slate: '#5A6660',
  line: '#E3E1D8',
  latin: '"IBM Plex Sans", sans-serif',
  deva: '"IBM Plex Sans Devanagari", sans-serif',
  arab: '"IBM Plex Sans Arabic", sans-serif',
};

// Two branches converge; one heavier line continues. The Y, rotated into motion.
function MarkA({ size = 64, color = A.ink, fwd }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Yukti mark — territory A">
      <path d="M4 6.5 L14.5 16 L4 25.5" stroke={color} strokeWidth="4.6" fill="none"></path>
      <path d="M13 16 H29" stroke={fwd || color} strokeWidth="6.4" fill="none"></path>
    </svg>
  );
}
function WordA({ size = 30, color = A.ink }) {
  return <span style={{ fontFamily: A.latin, fontWeight: 600, fontSize: size, letterSpacing: '-0.015em', color, lineHeight: 1 }}>yukti</span>;
}
function DevaA({ size = 28, color = A.ink }) {
  return <span style={{ fontFamily: A.deva, fontWeight: 600, fontSize: size, color, lineHeight: 1.2 }}>युक्ति</span>;
}

function ABoardMark() {
  return (
    <BoardPad>
      <BoardHead kicker="Territory A · The Fork, Resolved" title="Two paths in. One line out."
        note="The mark is the Y of Yukti rotated into motion: alternatives converge at a junction and resolve into a single, heavier forward stroke — judgment becoming momentum. No swoosh, no arrowhead, no nodes." />
      <div style={{ background: A.ink, borderRadius: 6, height: 168, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        <MarkA size={92} color={A.paper} fwd={A.hero} />
        <WordA size={58} color={A.paper} />
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <LockupCell label="Horizontal" grow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><MarkA size={40} fwd={A.heroText} /><WordA size={27} /></div>
        </LockupCell>
        <LockupCell label="Stacked">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><MarkA size={36} fwd={A.heroText} /><WordA size={19} /></div>
        </LockupCell>
        <LockupCell label="Symbol only"><MarkA size={48} fwd={A.heroText} /></LockupCell>
        <LockupCell label="Monochrome">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><MarkA size={36} /><WordA size={24} /></div>
        </LockupCell>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <LockupCell label="Devanagari secondary" grow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><MarkA size={36} fwd={A.heroText} /><DevaA size={26} /></div>
        </LockupCell>
        <LockupCell label="App icon (buyer PWA)" bg="#efeee8">
          <div style={{ width: 64, height: 64, borderRadius: 15, background: A.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MarkA size={42} color={A.paper} fwd={A.hero} />
          </div>
        </LockupCell>
        <LockupCell label="Favicon · 16 px actual" bg="#efeee8">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <MarkA size={16} /><MarkA size={16} color={A.heroText} />
          </div>
        </LockupCell>
        <LockupCell label="Reversed on hero" bg={A.hero}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><MarkA size={34} color={A.ink} /><WordA size={23} color={A.ink} /></div>
        </LockupCell>
      </div>
      <div style={{ borderTop: '1px solid ' + A.line, paddingTop: 12, fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>
        <strong style={{ color: '#1c1b18' }}>Rationale:</strong> the unfair advantage made literal — many options, one decisive move; the owner's letterform is the junction where deciding turns into winning.
      </div>
    </BoardPad>
  );
}

function ABoardColorType() {
  return (
    <BoardPad>
      <BoardHead kicker="Territory A · Color + Type" title="Won Green on Ledger Ink"
        note="Green claimed as growth, not finance: a single hero used for the forward stroke, the one next-action per view, and nothing else. Discipline comes from near-black green ink and warm paper." />
      <div style={{ display: 'flex', gap: 14 }}>
        <Sw c={A.ink} name="Ink" role="Surfaces, text — a green-black, not corporate navy" />
        <Sw c={A.paper} name="Paper" role="Warm ground; never pure white" />
        <Sw c={A.hero} name="Momentum Green" role="Graphic + large text only" />
        <Sw c={A.heroText} name="Won Green" role="Text-safe hero for links, CTAs on paper" />
        <Sw c={A.slate} name="Slate Moss" role="Secondary text" />
        <Sw c={A.line} name="Hairline" role="Dividers, card strokes" />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <AABadge fg={A.ink} bg={A.paper} label="Ink/Paper" />
        <AABadge fg={A.heroText} bg={A.paper} label="Won/Paper" />
        <AABadge fg={A.hero} bg={A.ink} label="Hero/Ink" />
        <AABadge fg={A.paper} bg={A.heroText} label="Paper/Won" />
      </div>
      <div style={{ background: '#fff', border: '1px solid ' + A.line, borderRadius: 6, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 15 }}>
        <ScriptLine tag="Latin · display" font={A.latin} size={31} weight={600} text="Run the business. Win the market." ls="-0.015em" />
        <ScriptLine tag="Devanagari" font={A.deva} size={27} weight={600} text="सही फ़ैसले। असली बढ़त।" />
        <ScriptLine tag="Arabic · RTL" font={A.arab} size={26} weight={600} dir="rtl" text="قرارات صحيحة. نموّ حقيقي." />
        <ScriptLine tag="Product UI" font={A.latin} size={15} weight={500} color={A.slate} text="3 prices need review · 18 SKUs on track · Books updated themselves at 6:02 pm" />
        <ScriptLine tag="Numerals" font={A.latin} size={19} weight={600} text="₹1,24,50,000 (1.24 crore)  ·  AED 4,500,250  ·  €312,400" />
      </div>
      <div style={{ borderTop: '1px solid ' + A.line, paddingTop: 12, fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>
        <strong style={{ color: '#1c1b18' }}>Type:</strong> IBM Plex Sans superfamily — Latin, Devanagari and Arabic drawn as true siblings, so one voice ships in three scripts on day one. Operator-grade and exact; zero personality-quirk where money is shown.
      </div>
    </BoardPad>
  );
}

Object.assign(window, { ABoardMark, ABoardColorType, MarkA });
