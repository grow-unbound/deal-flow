// Territory B — "The Step Up" (rising baseline, level gained and held)
const B = {
  ink: '#26180F',
  paper: '#FAF5EC',
  hero: '#E14E1B',     // graphic vermilion
  heroText: '#A93C10', // text-safe vermilion
  warm: '#6E5F52',
  line: '#EADFD0',
  latin: '"Anek Latin", sans-serif',
  deva: '"Anek Devanagari", sans-serif',
  arab: '"Cairo", sans-serif',
};

// One step up, then forward. Drawn as a single heavy stroke — a level gained and held.
function MarkB({ size = 64, color = B.ink }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Yukti mark — territory B">
      <path d="M3 24.8 H14.6 V10 H29" stroke={color} strokeWidth="6" fill="none"></path>
    </svg>
  );
}
function WordB({ size = 30, color = B.ink }) {
  return <span style={{ fontFamily: B.latin, fontWeight: 700, fontSize: size, letterSpacing: '0.045em', color, lineHeight: 1 }}>YUKTI</span>;
}
function DevaB({ size = 28, color = B.ink }) {
  return <span style={{ fontFamily: B.deva, fontWeight: 700, fontSize: size, color, lineHeight: 1.2 }}>युक्ति</span>;
}

function BBoardMark() {
  return (
    <BoardPad style={{ background: B.paper }}>
      <BoardHead kicker="Territory B · The Step Up" title="A level gained — and held."
        note="Growth drawn as a floor that rises: one step up, then a long forward line. Not a chart, not a swoosh — a structural promise that every good decision permanently raises where the business stands. Reads at 16 px as a bold glyph." />
      <div style={{ background: B.ink, borderRadius: 6, height: 168, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <MarkB size={92} color={B.hero} />
        <WordB size={52} color={B.paper} />
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <LockupCell label="Horizontal" grow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><MarkB size={38} color={B.heroText} /><WordB size={25} /></div>
        </LockupCell>
        <LockupCell label="Stacked">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><MarkB size={34} color={B.heroText} /><WordB size={16} /></div>
        </LockupCell>
        <LockupCell label="Symbol only"><MarkB size={48} color={B.heroText} /></LockupCell>
        <LockupCell label="Monochrome">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><MarkB size={34} /><WordB size={21} /></div>
        </LockupCell>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <LockupCell label="Devanagari secondary" grow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><MarkB size={34} color={B.heroText} /><DevaB size={25} /></div>
        </LockupCell>
        <LockupCell label="App icon (buyer PWA)" bg="#f1e9dc">
          <div style={{ width: 64, height: 64, borderRadius: 15, background: B.hero, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MarkB size={42} color={B.paper} />
          </div>
        </LockupCell>
        <LockupCell label="Favicon · 16 px actual" bg="#f1e9dc">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <MarkB size={16} /><MarkB size={16} color={B.heroText} />
          </div>
        </LockupCell>
        <LockupCell label="Reversed on hero" bg={B.hero}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><MarkB size={32} color={B.paper} /><WordB size={20} color={B.paper} /></div>
        </LockupCell>
      </div>
      <div style={{ borderTop: '1px solid ' + B.line, paddingTop: 12, fontSize: 12.5, color: '#5d4f43', lineHeight: 1.5 }}>
        <strong style={{ color: B.ink }}>Rationale:</strong> the unfair advantage as compounding — each winning move steps the baseline up and the business never gives the ground back.
      </div>
    </BoardPad>
  );
}

function BBoardColorType() {
  return (
    <BoardPad style={{ background: B.paper }}>
      <BoardHead kicker="Territory B · Color + Type" title="Vermilion heat on warm paper"
        note="The hottest of the three: a vermilion that is India-credible without being decoration, and reads as pure momentum in Dubai or Berlin. Caps-led Anek gives the voice its decisiveness; warmth comes from paper, not clutter." />
      <div style={{ display: 'flex', gap: 14 }}>
        <Sw c={B.ink} name="Roast Ink" role="Text, dark surfaces — warm black" />
        <Sw c={B.paper} name="Chalk" role="Warm cream ground" />
        <Sw c={B.hero} name="Vermilion" role="Graphic + large text only" />
        <Sw c={B.heroText} name="Deep Vermilion" role="Text-safe hero on paper" />
        <Sw c={B.warm} name="Clay" role="Secondary text" />
        <Sw c={B.line} name="Sand line" role="Dividers, card strokes" />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <AABadge fg={B.ink} bg={B.paper} label="Ink/Chalk" />
        <AABadge fg={B.heroText} bg={B.paper} label="DeepVerm/Chalk" />
        <AABadge fg={B.hero} bg={B.ink} label="Verm/Ink" />
        <AABadge fg={B.paper} bg={B.heroText} label="Chalk/DeepVerm" />
      </div>
      <div style={{ background: '#fff', border: '1px solid ' + B.line, borderRadius: 6, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 15 }}>
        <ScriptLine tag="Latin · display" font={B.latin} size={31} weight={800} text="MAKE EVERY MOVE COUNT." ls="0.02em" color={B.ink} />
        <ScriptLine tag="Devanagari" font={B.deva} size={27} weight={700} text="हर फ़ैसला, एक कदम ऊपर।" color={B.ink} />
        <ScriptLine tag="Arabic · RTL" font={B.arab} size={26} weight={700} dir="rtl" text="كل قرار خطوة إلى الأعلى." color={B.ink} />
        <ScriptLine tag="Product UI" font={B.latin} size={15} weight={500} color={B.warm} text="Here's what needs your attention today — 3 prices, 1 stuck order." />
        <ScriptLine tag="Numerals" font={B.latin} size={19} weight={600} color={B.ink} text="₹1,24,50,000 (1.24 crore)  ·  AED 4,500,250  ·  €312,400" />
      </div>
      <div style={{ borderTop: '1px solid ' + B.line, paddingTop: 12, fontSize: 12.5, color: '#5d4f43', lineHeight: 1.5 }}>
        <strong style={{ color: B.ink }}>Type:</strong> Anek Latin + Anek Devanagari (one Ek Type superfamily, Indian-script-first by design) paired with Cairo for Arabic — bold caps for the loud register, regular weights stay exact for money and data.
      </div>
    </BoardPad>
  );
}

Object.assign(window, { BBoardMark, BBoardColorType, MarkB });
